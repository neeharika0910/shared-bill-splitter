import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

type HomeRecord = {
  id: string
  name: string
}

type Member = {
  id: string
  homeId: string
  name: string
  memberOrder?: number
}

type Share = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const data = (await response.json().catch(() => ({}))) as {
    error?: string
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`)
  }

  return data as T
}

function Home() {
  const [home, setHome] = useState<HomeRecord | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  const [homeName, setHomeName] = useState('')
  const [memberName, setMemberName] = useState('')
  const [billTitle, setBillTitle] = useState('')
  const [billAmount, setBillAmount] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [payingShareId, setPayingShareId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadHomeData = useCallback(async (homeId: string) => {
    setLoading(true)
    setError('')

    try {
      const [billData, balanceData] = await Promise.all([
        request<{ bills: Bill[] }>(`/api/homes/${homeId}/bills`),
        request<{ balances: Balance[] }>(`/api/homes/${homeId}/balances`),
      ])

      setBills(billData.bills)
      setBalances(balanceData.balances)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load home data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (home) {
      void loadHomeData(home.id)
    }
  }, [home, loadHomeData])

  async function createHome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!homeName.trim()) {
      setError('Enter a home name.')
      return
    }

    setSaving(true)

    try {
      const created = await request<HomeRecord>('/api/homes', {
        method: 'POST',
        body: JSON.stringify({ name: homeName.trim() }),
      })

      setHome(created)
      setHomeName('')
      setNotice('Home created successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create home')
    } finally {
      setSaving(false)
    }
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!home || !memberName.trim()) {
      setError('Enter a member name.')
      return
    }

    setError('')
    setNotice('')
    setSaving(true)

    try {
      const member = await request<Member>(`/api/homes/${home.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ name: memberName.trim() }),
      })

      setMembers((current) => [...current, member])
      setMemberName('')
      setNotice(`${member.name} was added.`)
      await loadHomeData(home.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add member')
    } finally {
      setSaving(false)
    }
  }

  async function createBill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!home) return

    const amount = Number(billAmount)
    const totalCents = Math.round(amount * 100)

    if (
      !billTitle.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(totalCents)
    ) {
      setError('Enter a bill title and a positive amount with at most 2 decimals.')
      return
    }

    if (members.length === 0) {
      setError('Add at least one member before creating a bill.')
      return
    }

    setError('')
    setNotice('')
    setSaving(true)

    try {
      await request<Bill>(`/api/homes/${home.id}/bills`, {
        method: 'POST',
        body: JSON.stringify({
          title: billTitle.trim(),
          totalCents,
        }),
      })

      setBillTitle('')
      setBillAmount('')
      setNotice('Bill created and split successfully.')
      await loadHomeData(home.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create bill')
    } finally {
      setSaving(false)
    }
  }

  async function payShare(billId: string, shareId: string) {
    setError('')
    setNotice('')
    setPayingShareId(shareId)

    try {
      await request(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
        },
      })

      setNotice('Payment recorded successfully.')
      if (home) {
        await loadHomeData(home.id)
      }
    } catch (err) {
      // Do not mark the share as paid locally when the request fails.
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setPayingShareId(null)
    }
  }

  function resetHome() {
    setHome(null)
    setMembers([])
    setBills([])
    setBalances([])
    setError('')
    setNotice('')
  }

  const styles = {
    page: {
      minHeight: '100vh',
      background: '#f5f7fb',
      color: '#172033',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '32px 16px',
    } as const,
    container: {
      maxWidth: 1000,
      margin: '0 auto',
    } as const,
    card: {
      background: '#ffffff',
      border: '1px solid #e5e9f2',
      borderRadius: 16,
      padding: 24,
      marginBottom: 20,
      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
    } as const,
    input: {
      width: '100%',
      boxSizing: 'border-box' as const,
      padding: '12px 14px',
      border: '1px solid #d5dce8',
      borderRadius: 9,
      fontSize: 15,
      marginTop: 7,
      marginBottom: 12,
      background: '#fff',
      color: '#172033',
    } as const,
    button: {
      padding: '11px 16px',
      border: 0,
      borderRadius: 9,
      background: '#4f46e5',
      color: '#fff',
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
    } as const,
    secondaryButton: {
      padding: '9px 13px',
      border: '1px solid #d5dce8',
      borderRadius: 9,
      background: '#fff',
      color: '#172033',
      fontSize: 13,
      cursor: 'pointer',
    } as const,
    muted: {
      color: '#64748b',
      fontSize: 14,
    } as const,
  }

  return (
    <>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f4f6fb; color: #182238; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        main { min-height: 100vh !important; padding: 34px 22px !important; background: #f4f6fb !important; }
        main > div { max-width: 1120px !important; }
        header { background: #182238; color: white; padding: 30px 34px; border-radius: 20px; margin-bottom: 24px !important; box-shadow: 0 12px 32px rgba(24,34,56,.12); }
        header p:first-child { color: #aaa4ff !important; font-size: 11px !important; letter-spacing: 1.8px !important; }
        header h1 { font-size: clamp(27px, 4vw, 36px) !important; letter-spacing: -1.2px; }
        header p:last-child { color: #c1cada !important; }
        section { background: #fff !important; border: 1px solid #e6eaf2 !important; border-radius: 17px !important; padding: 24px !important; margin-bottom: 18px !important; box-shadow: 0 5px 22px rgba(25,35,60,.035) !important; }
        section h2 { font-size: 17px !important; letter-spacing: -.3px; }
        label { display: block; color: #536076; font-size: 12px; font-weight: 700; margin: 4px 0 0; }
        input { width: 100% !important; box-sizing: border-box !important; padding: 12px 14px !important; border: 1px solid #dfe4ed !important; border-radius: 10px !important; background: #fbfcfe !important; color: #182238 !important; font-size: 14px !important; outline: none; }
        input:focus { border-color: #8176ec !important; box-shadow: 0 0 0 3px rgba(101,88,232,.12); background: white !important; }
        button { border-radius: 10px !important; font-weight: 700 !important; transition: .18s ease; }
        button:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(.97); }
        button:disabled { opacity: .6; cursor: not-allowed !important; }
        table { border-collapse: separate !important; border-spacing: 0; overflow: hidden; border: 1px solid #edf0f5; border-radius: 12px; }
        th { color: #7d8799; background: #f8f9fc; font-size: 11px; text-transform: uppercase; letter-spacing: .8px; }
        td { border-bottom: 1px solid #f0f2f6; font-size: 13px; }
        article { background: #fcfcfe; border-color: #e9edf4 !important; border-radius: 13px !important; }
        article h3 { font-size: 15px; letter-spacing: -.2px; }
        article button { padding: 9px 12px !important; font-size: 12px !important; }
        footer { padding-top: 24px !important; }
        @media (max-width: 600px) {
          main { padding: 18px 12px !important; }
          header { padding: 23px 20px; }
          section { padding: 18px !important; }
        }
      `}</style>

    <main style={styles.page}>
      <div style={styles.container}>
        <header style={{ marginBottom: 28 }}>
          <p
            style={{
              color: '#4f46e5',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Shared home finances
          </p>
          <h1 style={{ fontSize: 32, margin: 0 }}>Bill Splitter</h1>
          <p style={{ ...styles.muted, marginTop: 8 }}>
            Keep shared expenses organized and make settling up simple.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            style={{
              background: '#fff1f2',
              color: '#be123c',
              border: '1px solid #fecdd3',
              borderRadius: 10,
              padding: 14,
              marginBottom: 16,
            }}
          >
            {error}
            <button
              type="button"
              onClick={() => setError('')}
              style={{ ...styles.secondaryButton, marginLeft: 12 }}
            >
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            style={{
              background: '#ecfdf5',
              color: '#047857',
              border: '1px solid #a7f3d0',
              borderRadius: 10,
              padding: 14,
              marginBottom: 16,
            }}
          >
            {notice}
          </div>
        )}

        {!home ? (
          <section style={styles.card}>
            <h2 style={{ marginTop: 0 }}>Create your home</h2>
            <p style={styles.muted}>Start by creating a shared home for your expenses.</p>
            <form onSubmit={createHome}>
              <label htmlFor="homeName">Home name</label>
              <input
                id="homeName"
                style={styles.input}
                value={homeName}
                onChange={(event) => setHomeName(event.target.value)}
                placeholder="e.g. Green Villa"
                maxLength={100}
                required
              />
              <button type="submit" style={styles.button} disabled={saving}>
                {saving ? 'Creating…' : 'Create home'}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section style={styles.card}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <p style={{ ...styles.muted, margin: 0 }}>Your home</p>
                  <h2 style={{ margin: '6px 0 0' }}>{home.name}</h2>
                </div>
                <button type="button" style={styles.secondaryButton} onClick={resetHome}>
                  Start another home
                </button>
              </div>
            </section>

            <section style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Members</h2>

              {members.length === 0 ? (
                <p style={styles.muted}>No members have been added yet.</p>
              ) : (
                <ul style={{ paddingLeft: 20 }}>
                  {members.map((member) => (
                    <li key={member.id} style={{ marginBottom: 7 }}>
                      {member.name}
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={addMember}>
                <label htmlFor="memberName">Add a member</label>
                <input
                  id="memberName"
                  style={styles.input}
                  value={memberName}
                  onChange={(event) => setMemberName(event.target.value)}
                  placeholder="Member name"
                  maxLength={100}
                  required
                />
                <button type="submit" style={styles.button} disabled={saving}>
                  {saving ? 'Adding…' : 'Add member'}
                </button>
              </form>
            </section>

            <section style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Add a bill</h2>
              <p style={styles.muted}>
                The total is split equally. Any extra cents go to members in the order they were
                added.
              </p>

              <form onSubmit={createBill}>
                <label htmlFor="billTitle">Bill title</label>
                <input
                  id="billTitle"
                  style={styles.input}
                  value={billTitle}
                  onChange={(event) => setBillTitle(event.target.value)}
                  placeholder="e.g. Electricity"
                  maxLength={150}
                  required
                />

                <label htmlFor="billAmount">Total amount (USD)</label>
                <input
                  id="billAmount"
                  style={styles.input}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={billAmount}
                  onChange={(event) => setBillAmount(event.target.value)}
                  placeholder="e.g. 120.00"
                  required
                />

                <button
                  type="submit"
                  style={styles.button}
                  disabled={saving || members.length === 0}
                >
                  {saving ? 'Creating…' : 'Create and split bill'}
                </button>
              </form>
            </section>

            <section style={styles.card}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <h2 style={{ marginTop: 0 }}>Outstanding balances</h2>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => void loadHomeData(home.id)}
                  disabled={loading}
                >
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {loading ? (
                <p role="status" style={styles.muted}>
                  Loading balances…
                </p>
              ) : balances.length === 0 ? (
                <p style={styles.muted}>No balances to show yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      textAlign: 'left',
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ padding: 10, borderBottom: '1px solid #e5e9f2' }}>Member</th>
                        <th style={{ padding: 10, borderBottom: '1px solid #e5e9f2' }}>
                          Unpaid amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {balances.map((balance) => (
                        <tr key={balance.memberId}>
                          <td style={{ padding: 10 }}>{balance.name}</td>
                          <td style={{ padding: 10, fontWeight: 600 }}>
                            {money(balance.outstandingCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Bills and shares</h2>

              {loading ? (
                <p role="status" style={styles.muted}>
                  Loading bills…
                </p>
              ) : bills.length === 0 ? (
                <p style={styles.muted}>No bills yet. Create your first bill above.</p>
              ) : (
                <div>
                  {bills.map((bill) => (
                    <article
                      key={bill.id}
                      style={{
                        border: '1px solid #e5e9f2',
                        borderRadius: 12,
                        padding: 18,
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <h3 style={{ margin: '0 0 5px' }}>{bill.title}</h3>
                          <p style={{ ...styles.muted, margin: 0 }}>
                            Total: {money(bill.totalCents)}
                          </p>
                        </div>
                      </div>

                      <div style={{ marginTop: 16 }}>
                        {bill.shares.map((share) => {
                          const member = members.find((item) => item.id === share.memberId)
                          const isPaid = share.paidAt !== null
                          const isPaying = payingShareId === share.id

                          return (
                            <div
                              key={share.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                                flexWrap: 'wrap',
                                padding: '12px 0',
                                borderTop: '1px solid #eef1f6',
                              }}
                            >
                              <div>
                                <strong>{member?.name ?? 'Unknown member'}</strong>
                                <p style={{ ...styles.muted, margin: '4px 0 0' }}>
                                  {money(share.amountCents)}
                                </p>
                              </div>

                              {isPaid ? (
                                <span
                                  style={{
                                    color: '#047857',
                                    background: '#ecfdf5',
                                    padding: '7px 10px',
                                    borderRadius: 20,
                                    fontSize: 13,
                                    fontWeight: 600,
                                  }}
                                >
                                  Paid
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  style={styles.button}
                                  onClick={() => void payShare(bill.id, share.id)}
                                  disabled={isPaying}
                                >
                                  {isPaying ? 'Paying…' : 'Mark as paid'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <footer
          style={{
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: 13,
            padding: '12px 0 24px',
          }}
        >
          Shared Bill Splitter
        </footer>
      </div>
    </main>
    </>
  )
}
