import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Inbox, Files, ChartNoAxesCombined, LogOut, Plus, CheckCircle2, Route as RouteIcon, Check, ArrowRight, X } from 'lucide-react'

export const Route = createFileRoute('/')({ component: Home })

type User = { id: number; name: string; email: string; role: string }
type Step = { id: number; position: number; name: string; assignee: User; status: string; dueAt: string; completedAt?: string; note?: string }
type Activity = { id: number; actor: string; action: string; note?: string; createdAt: string }
type Item = { id: number; title: string; type: string; description: string; creator: User; status: string; currentStep: number; createdAt: string; updatedAt: string; completedAt?: string; steps: Step[]; activity: Activity[] }
type Metrics = { total: number; active: number; approved: number; returned: number; overdueStages: number; averageHours: string }
type View = 'inbox' | 'all' | 'analytics'

const accounts = [
  { email: 'initiator@marshrut.demo', name: 'Елена Морозова', role: 'Инициатор' },
  { email: 'manager@marshrut.demo', name: 'Максим Орлов', role: 'Руководитель' },
  { email: 'legal@marshrut.demo', name: 'Анна Волкова', role: 'Юрист' },
  { email: 'finance@marshrut.demo', name: 'Ирина Соколова', role: 'Финансы' },
]
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие')
  return data as T
}
const statusText = (s: string) => ({ in_progress: 'На согласовании', approved: 'Согласовано', returned: 'Возвращено' })[s as 'in_progress'] || s
const actionText = (s: string) => ({ created: 'создал(а) заявку', approved: 'согласовал(а)', returned: 'вернул(а) на доработку', resubmitted: 'отправил(а) повторно' })[s as 'created'] || s
const fmt = (s?: string) => s ? new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtTime = (s?: string) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

function Home() {
  const [me, setMe] = useState<User | null | undefined>(undefined)
  const [items, setItems] = useState<Item[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [view, setView] = useState<View>('inbox')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (user: User) => {
    const next = await api<Item[]>('/requests')
    setItems(next)
    setSelectedId((id) => id !== null && next.some((x) => x.id === id) ? id : next[0]?.id ?? null)
    if (user.role === 'manager') setMetrics(await api<Metrics>('/metrics'))
  }, [])
  useEffect(() => { api<User>('/me').then(async (u) => { setMe(u); if (u.role === 'initiator') setView('all'); await load(u) }).catch(() => setMe(null)) }, [load])
  const inbox = useMemo(() => items.filter((x) => x.status === 'in_progress' && x.steps[x.currentStep]?.assignee.id === me?.id), [items, me])
  const visible = view === 'inbox' ? inbox : items
  const selected = visible.find((x) => x.id === selectedId) || visible[0]
  async function act(path: string, body: unknown) { if (!me) return; setBusy(true); setError(''); try { await api(path, 'POST', body); await load(me) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  async function logout() { await api('/logout', 'POST'); setMe(null); setItems([]) }
  if (me === undefined) return <div className="boot"><b className="logo">М</b><p>Загружаем «Маршрут»…</p></div>
  if (me === null) return <Login onLogin={async (u) => { setMe(u); setView(u.role === 'initiator' ? 'all' : 'inbox'); await load(u) }} />
  return <div className="shell">
    <aside className="sidebar"><div className="brand"><b className="logo">М</b><div>МАРШРУТ<small>ДЕМО · 2026</small></div></div><div className="side-label">РАБОЧЕЕ ПРОСТРАНСТВО</div><button className={view === 'inbox' ? 'nav active' : 'nav'} onClick={() => { setView('inbox'); setSelectedId(null) }} ><Inbox size={17} strokeWidth={1.8}/><span>Мои задачи</span><em>{inbox.length}</em></button><button className={view === 'all' ? 'nav active' : 'nav'} onClick={() => { setView('all'); setSelectedId(null) }} ><Files size={17} strokeWidth={1.8}/><span>Заявки</span><em>{items.length}</em></button>{me.role === 'manager' && <button className={view === 'analytics' ? 'nav active' : 'nav'} onClick={() => setView('analytics')} ><ChartNoAxesCombined size={17} strokeWidth={1.8}/><span>Аналитика</span></button>}<div className="side-note"><strong>ПРОТОТИП ДЛЯ ДЕМОНСТРАЦИИ</strong><p>Все имена и заявки вымышлены. Не добавляйте реальные документы или персональные данные.</p></div></aside>
    <div className="workspace"><header className="topbar"><div className="eyebrow">ЭФФЕКТИВНОСТЬ 360 &nbsp;/&nbsp; СОГЛАСОВАНИЕ</div><div className="profile"><b>{me.name.split(' ').map((x) => x[0]).join('')}</b><span><strong>{me.name}</strong><small>{accounts.find((a) => a.email === me.email)?.role}</small></span><button onClick={logout} title="Выйти" aria-label="Выйти"><LogOut size={18}/></button></div></header>
      {view === 'analytics' ? <Analytics metrics={metrics} items={items} /> : <><section className="heading"><div><div className="eyebrow blue">{view === 'inbox' ? '01 / ВАШЕ ВНИМАНИЕ' : '02 / РЕЕСТР'}</div><h1>{view === 'inbox' ? 'Мои задачи' : 'Все заявки'}</h1><p>{view === 'inbox' ? 'Документы, которые ожидают вашего решения сейчас.' : 'Один маршрут для каждой заявки. Каждый шаг на виду.'}</p></div><button className="primary" onClick={() => setCreating(true)}> <Plus size={16}/> Новая заявка</button></section>{error && <div className="error">{error}<button onClick={() => setError('')} aria-label="Закрыть ошибку"><X size={17}/></button></div>}<section className="board"><div className="list"><div className="list-title"><span>{view === 'inbox' ? 'ОЖИДАЮТ РЕШЕНИЯ' : 'ЗАЯВКИ'}</span><span>{String(visible.length).padStart(2, '0')}</span></div>{visible.length ? visible.map((x) => <button key={x.id} className={selected?.id === x.id ? 'list-item selected' : 'list-item'} onClick={() => setSelectedId(x.id)}><div className="list-item-top"><span>№ {String(x.id).padStart(4, '0')}</span><span className={`status ${x.status}`}>{statusText(x.status)}</span></div><strong>{x.title}</strong><div className="list-item-bottom"><span>{x.type}</span><span>{fmt(x.updatedAt)}</span></div></button>) : <div className="empty"><CheckCircle2 size={46} strokeWidth={1.3}/><h3>Нет задач на согласовании</h3><p>Заявки появятся здесь, когда подойдёт ваш этап.</p></div>}</div><div className="detail">{selected ? <Detail key={selected.id} item={selected} me={me} busy={busy} onDecision={(decision, note) => act(`/requests/${selected.id}/decision`, { decision, note })} onResubmit={(description) => act(`/requests/${selected.id}/resubmit`, { description })} /> : <div className="empty"><RouteIcon size={46} strokeWidth={1.3}/><h3>Выберите заявку</h3><p>Здесь будут этапы, ответственные и история решений.</p></div>}</div></section></>}
    </div>{creating && <CreateModal busy={busy} onClose={() => setCreating(false)} onCreate={async (data) => { setBusy(true); setError(''); try { const x = await api<Item>('/requests', 'POST', data); await load(me); setView('all'); setSelectedId(x.id); setCreating(false) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }} />}</div>
}

function Login({ onLogin }: { onLogin: (u: User) => Promise<void> }) {
  const [email, setEmail] = useState(accounts[0].email), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await onLogin(await api<User>('/login', 'POST', { email, password })) } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  return <main className="welcome"><div className="welcome-frame"><header className="welcome-nav"><div className="welcome-brand"><span className="mark"><i/><i/><i/><i/></span><strong>маршрут</strong></div><span>ПРОЗРАЧНОЕ СОГЛАСОВАНИЕ ДОКУМЕНТОВ</span><a href="#demo">Открыть демо <ArrowRight size={14}/></a></header><section className="welcome-hero"><div className="eyebrow">CODEMASTERS · ЭФФЕКТИВНОСТЬ 360</div><h1>Согласование<br/>без слепых зон.</h1><p>Всегда видно, где заявка, кто отвечает за следующий шаг и когда ждать решение.</p><a className="welcome-cta" href="#demo">Попробовать демо <ArrowRight size={18}/></a><small>Четыре роли. Один понятный маршрут.</small></section><section className="welcome-strip" aria-label="Возможности Маршрута"><div className="showcase-card showcase-dark"><span>01 / ЗАЯВКА</span><div className="mock-request"><div className="mock-top">№ 0042 <span>На согласовании</span></div><strong>Закупка оборудования</strong><small>Следующий шаг: руководитель</small><div className="mock-progress"><i/><i/><i/></div></div></div><div className="showcase-card showcase-cream"><span>02 / МАРШРУТ</span><RouteIcon size={40} strokeWidth={1.4}/><strong>Каждый шаг<br/>на виду.</strong></div><div className="showcase-card showcase-blue"><span>03 / РЕШЕНИЕ</span><div className="mock-check"><Check size={25}/></div><strong>Согласовано.</strong><small>История сохраняется автоматически.</small></div><div className="showcase-card showcase-lilac"><span>04 / АНАЛИТИКА</span><strong className="mock-number">3<span>этапа</span></strong><small>У закупки: руководитель,<br/>финансы и юрист</small></div></section><section className="welcome-access" id="demo"><div><div className="eyebrow blue">ДЕМОНСТРАЦИОННЫЙ ДОСТУП</div><h2>Посмотрите изнутри.</h2><p>Переключайтесь между ролями и пройдите заявку от создания до решения.</p></div><form className="access-form" onSubmit={submit}><label>Роль<select value={email} onChange={(e) => setEmail(e.target.value)}>{accounts.map((a) => <option key={a.email} value={a.email}>{a.name} · {a.role}</option>)}</select></label><label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль демонстрации" required /></label>{error && <div className="form-error">{error}</div>}<button className="primary full" disabled={busy}>{busy ? 'Входим…' : <>Войти в демо <ArrowRight size={16}/></>}</button><small>Только вымышленные данные. Не добавляйте реальные документы.</small></form></section><footer className="welcome-footer">МАРШРУТ <span>CODEMASTERS · 2026</span></footer></div></main>
}

function Detail({ item, me, busy, onDecision, onResubmit }: { item: Item; me: User; busy: boolean; onDecision: (d: string, n: string) => void; onResubmit: (d: string) => void }) {
  const [note, setNote] = useState(''), [description, setDescription] = useState(item.description)
  const canDecide = item.status === 'in_progress' && item.steps[item.currentStep]?.assignee.id === me.id
  const canResubmit = item.status === 'returned' && item.creator.id === me.id
  return <div className="detail-body"><div className="detail-head"><div className="eyebrow">ЗАЯВКА № {String(item.id).padStart(4, '0')}</div><span className={`status ${item.status}`}>{statusText(item.status)}</span></div><h2>{item.title}</h2><div className="meta">{item.type} &nbsp;·&nbsp; Создана {fmt(item.createdAt)} &nbsp;·&nbsp; {item.creator.name}</div><p className="desc">{item.description || 'Описание не добавлено'}</p><hr/><div className="section-head"><h3>Маршрут согласования</h3><span>{item.steps.filter((s) => s.status === 'approved').length} / {item.steps.length} этапов</span></div><div className="steps">{item.steps.map((s) => <div className={`step ${s.status}`} key={s.id}><div className="step-num">{s.status === 'approved' ? <Check size={13}/> : String(s.position + 1).padStart(2, '0')}</div><div className="step-info"><div><strong>{s.name}</strong><span>{s.status === 'approved' ? 'Согласовано' : s.status === 'returned' ? 'Возвращено' : s.status === 'active' ? 'Текущий этап' : 'Ожидает'}</span></div><p>{s.assignee.name} · {s.status === 'approved' ? fmtTime(s.completedAt) : `Срок: ${fmt(s.dueAt)}`}</p>{s.note && <blockquote>“{s.note}”</blockquote>}</div></div>)}</div>
    {canDecide && <div className="action-box"><div className="eyebrow blue">ВАШЕ РЕШЕНИЕ</div><h3>Заявка ожидает вас</h3><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий или причина возврата" maxLength={500}/><div><button className="primary" disabled={busy} onClick={() => onDecision('approve', note)}>Согласовать <ArrowRight size={16}/></button><button className="secondary" disabled={busy || note.trim().length < 3} onClick={() => onDecision('return', note)}>Вернуть</button></div></div>}
    {canResubmit && <div className="action-box"><div className="eyebrow blue">ДОРАБОТКА</div><h3>Исправьте описание и отправьте снова</h3><textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000}/><button className="primary" disabled={busy} onClick={() => onResubmit(description)}>Отправить повторно <ArrowRight size={16}/></button></div>}
    <hr/><div className="section-head"><h3>История</h3></div><div className="history">{item.activity.map((a) => <div key={a.id}><i/><p><strong>{a.actor}</strong> {actionText(a.action)}{a.note && <span>“{a.note}”</span>}<small>{fmtTime(a.createdAt)}</small></p></div>)}</div></div>
}

function CreateModal({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (data: { title: string; type: string; description: string }) => void }) {
  const [title, setTitle] = useState(''), [type, setType] = useState('Закупка'), [description, setDescription] = useState('')
  return <div className="overlay" onMouseDown={onClose}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="close" onClick={onClose} aria-label="Закрыть"><X size={20}/></button><div className="eyebrow blue">НОВАЯ ЗАЯВКА</div><h2>Начать согласование</h2><p>Выберите тип: маршрут ответственных появится автоматически.</p><form onSubmit={(e) => { e.preventDefault(); onCreate({ title, type, description }) }}><label>Название документа<input value={title} onChange={(e) => setTitle(e.target.value)} minLength={5} maxLength={120} placeholder="Например, закупка оборудования" required /></label><label>Тип документа<select value={type} onChange={(e) => setType(e.target.value)}><option>Закупка</option><option>Договор</option><option>Служебная записка</option></select></label><label>Краткое описание<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="Что нужно согласовать? Не добавляйте реальные данные." /></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Создать заявку <ArrowRight size={16}/>'}</button></div></form></div></div>
}

function Analytics({ metrics, items }: { metrics: Metrics | null; items: Item[] }) {
  const active = items.filter((x) => x.status === 'in_progress')
  return <section className="analytics"><div className="eyebrow blue">03 / УЗКИЕ МЕСТА</div><h1>Пульс процесса</h1><p>Данные демонстрации. Здесь руководитель видит состояние потока.</p><div className="metrics">{[['ВСЕГО ЗАЯВОК', metrics?.total], ['В РАБОТЕ', metrics?.active], ['СОГЛАСОВАНО', metrics?.approved], ['ПРОСРОЧЕННЫХ ЭТАПОВ', metrics?.overdueStages]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}</div><div className="analytics-lower"><div><div className="eyebrow">СРЕДНЕЕ ВРЕМЯ СОГЛАСОВАНИЯ</div><div className="big-number">{metrics?.averageHours ?? '—'} <span>часа</span></div><p>По завершённым заявкам. В пилоте нужно сравнивать медиану до и после.</p></div><div><div className="eyebrow">СЕЙЧАС В РАБОТЕ</div>{active.length ? active.map((x) => <div className="analytics-row" key={x.id}><div><strong>{x.title}</strong><span>{x.steps[x.currentStep]?.name} · {x.steps[x.currentStep]?.assignee.name}</span></div><small>{fmt(x.steps[x.currentStep]?.dueAt)}</small></div>) : <p>Активных заявок нет.</p>}</div></div></section>
}
