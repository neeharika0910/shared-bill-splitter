import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Create a home
app.post('/api/homes', async (c) => {
  let body: { name?: string }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const name = body.name?.trim()

  if (!name) {
    return c.json({ error: 'Home name is required' }, 400)
  }

  const id = crypto.randomUUID()

  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()

  return c.json({ id, name }, 201)
})

// Add a member to a home
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: { name?: string }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const name = body.name?.trim()

  if (!name) {
    return c.json({ error: 'Member name is required' }, 400)
  }

  const orderResult = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(member_order), -1) + 1 AS next_order FROM members WHERE home_id = ?',
  )
    .bind(homeId)
    .first<{ next_order: number }>()

  const memberOrder = orderResult?.next_order ?? 0
  const id = crypto.randomUUID()

  await c.env.DB.prepare(
    'INSERT INTO members (id, home_id, name, member_order) VALUES (?, ?, ?, ?)',
  )
    .bind(id, homeId, name, memberOrder)
    .run()

  return c.json(
    {
      id,
      homeId,
      name,
      memberOrder,
    },
    201,
  )
})

// Get all bills and their shares for a home
app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const bills = await c.env.DB.prepare(
    `SELECT id, home_id, title, total_cents
     FROM bills
     WHERE home_id = ?
     ORDER BY rowid DESC`,
  )
    .bind(homeId)
    .all<{
      id: string
      home_id: string
      title: string
      total_cents: number
    }>()

  const result = await Promise.all(
    bills.results.map(async (bill) => {
      const shares = await c.env.DB.prepare(
        `SELECT id, member_id, amount_cents, paid_at
         FROM shares
         WHERE bill_id = ?`,
      )
        .bind(bill.id)
        .all<{
          id: string
          member_id: string
          amount_cents: number
          paid_at: string | null
        }>()

      return {
        id: bill.id,
        homeId: bill.home_id,
        title: bill.title,
        totalCents: bill.total_cents,
        shares: shares.results.map((share) => ({
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        })),
      }
    }),
  )

  return c.json({ bills: result })
})

// Create a bill and split it among the home's members
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: { title?: unknown; totalCents?: unknown }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''

  const totalCents = body.totalCents

  if (
    !title ||
    typeof totalCents !== 'number' ||
    !Number.isInteger(totalCents) ||
    totalCents <= 0
  ) {
    return c.json({ error: 'A title and a positive integer totalCents are required' }, 422)
  }

  const members = await c.env.DB.prepare(
    'SELECT id, name, member_order FROM members WHERE home_id = ? ORDER BY member_order ASC',
  )
    .bind(homeId)
    .all<{
      id: string
      name: string
      member_order: number
    }>()

  if (members.results.length === 0) {
    return c.json({ error: 'The home has no members' }, 422)
  }

  const billId = crypto.randomUUID()
  const memberCount = members.results.length

  // Integer division keeps all calculations in cents.
  const baseAmount = Math.floor(totalCents / memberCount)
  const remainder = totalCents % memberCount

  const shares = members.results.map((member, index) => ({
    id: crypto.randomUUID(),
    billId,
    memberId: member.id,
    amountCents: baseAmount + (index < remainder ? 1 : 0),
    paidAt: null,
  }))

  await c.env.DB.prepare('INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)')
    .bind(billId, homeId, title, totalCents)
    .run()

  // Store each share using the database's snake_case column names.
  const insertShareStatements = shares.map((share) =>
    c.env.DB.prepare(
      'INSERT INTO shares (id, bill_id, member_id, amount_cents, paid_at, idempotency_key) VALUES (?, ?, ?, ?, NULL, NULL)',
    ).bind(share.id, share.billId, share.memberId, share.amountCents),
  )

  await c.env.DB.batch(insertShareStatements)

  return c.json(
    {
      id: billId,
      homeId,
      title,
      totalCents,
      shares,
    },
    201,
  )
})

// Mark a share as paid
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const idempotencyKey = c.req.header('Idempotency-Key')

  if (!idempotencyKey?.trim()) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?').bind(billId).first()

  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404)
  }

  const share = await c.env.DB.prepare(
    'SELECT id, bill_id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<{
      id: string
      bill_id: string
      member_id: string
      amount_cents: number
      paid_at: string | null
      idempotency_key: string | null
    }>()

  if (!share) {
    return c.json({ error: 'Share not found' }, 404)
  }

  // If already paid with this same key, return the original result.
  if (share.paid_at !== null) {
    if (share.idempotency_key === idempotencyKey) {
      return c.json({
        id: share.id,
        billId: share.bill_id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: share.paid_at,
      })
    }

    return c.json({ error: 'Share has already been paid' }, 409)
  }

  const paidAt = new Date().toISOString()

  const updateResult = await c.env.DB.prepare(
    'UPDATE shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND bill_id = ? AND paid_at IS NULL',
  )
    .bind(paidAt, idempotencyKey, shareId, billId)
    .run()

  if (!updateResult.meta.changes) {
    // Another request may have paid the share while this request was running.
    const currentShare = await c.env.DB.prepare(
      'SELECT id, bill_id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
    )
      .bind(shareId, billId)
      .first<{
        id: string
        bill_id: string
        member_id: string
        amount_cents: number
        paid_at: string | null
        idempotency_key: string | null
      }>()

    if (currentShare?.paid_at && currentShare.idempotency_key === idempotencyKey) {
      return c.json({
        id: currentShare.id,
        billId: currentShare.bill_id,
        memberId: currentShare.member_id,
        amountCents: currentShare.amount_cents,
        paidAt: currentShare.paid_at,
      })
    }

    return c.json({ error: 'Share has already been paid' }, 409)
  }

  return c.json({
    id: share.id,
    billId: share.bill_id,
    memberId: share.member_id,
    amountCents: share.amount_cents,
    paidAt,
  })
})

// Get outstanding balances for each member in a home
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB.prepare(
    `SELECT
         members.id AS member_id,
         members.name AS name,
         COALESCE(
           SUM(
             CASE
               WHEN shares.paid_at IS NULL THEN shares.amount_cents
               ELSE 0
             END
           ),
           0
         ) AS outstanding_cents
       FROM members
       LEFT JOIN shares ON shares.member_id = members.id
       LEFT JOIN bills ON bills.id = shares.bill_id
       WHERE members.home_id = ?
       GROUP BY members.id, members.name, members.member_order
       ORDER BY members.member_order ASC`,
  )
    .bind(homeId)
    .all<{
      member_id: string
      name: string
      outstanding_cents: number
    }>()

  const balances = result.results.map((row) => ({
    memberId: row.member_id,
    name: row.name,
    outstandingCents: row.outstanding_cents,
  }))

  return c.json({ balances })
})

export default app
