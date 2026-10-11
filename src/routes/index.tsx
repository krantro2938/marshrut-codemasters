import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight, CircleHelp,
  Clock3, FileCheck2, FilePlus2, Files, Inbox, LayoutGrid, LogOut,
  Plus, Route as RouteIcon, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

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
  const response = await fetch(`/api${path}`, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие')
  return data as T
}
const statusText = (s: string) => ({ in_progress: 'На согласовании', approved: 'Согласовано', returned: 'На доработке' })[s as 'in_progress'] || s
const actionText = (s: string) => ({ created: 'создал(а) заявку', approved: 'согласовал(а)', returned: 'вернул(а) на доработку', resubmitted: 'отправил(а) повторно' })[s as 'created'] || s
const fmt = (s?: string) => s ? new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtTime = (s?: string) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const initials = (name: string) => name.split(' ').map(x => x[0]).join('')

function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand-lockup ${light ? 'brand-light' : ''}`}>
    <span className="brand-mark" aria-hidden="true"><i/><i/><i/><i/></span>
    <span>маршрут</span>
  </div>
}

function Status({ value }: { value: string }) {
  return <Badge variant="secondary" className={`status-badge status-${value}`}>
    <span className="status-dot"/>{statusText(value)}
  </Badge>
}

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
    setSelectedId(id => id !== null && next.some(x => x.id === id) ? id : next[0]?.id ?? null)
    if (user.role === 'manager') setMetrics(await api<Metrics>('/metrics'))
  }, [])
  useEffect(() => { api<User>('/me').then(async u => { setMe(u); if (u.role === 'initiator') setView('all'); await load(u) }).catch(() => setMe(null)) }, [load])
  const inbox = useMemo(() => items.filter(x => x.status === 'in_progress' && x.steps[x.currentStep]?.assignee.id === me?.id), [items, me])
  const visible = view === 'inbox' ? inbox : items
  const selected = visible.find(x => x.id === selectedId) || visible[0]
  async function act(path: string, body: unknown) {
    if (!me) return
    setBusy(true); setError('')
    try { await api(path, 'POST', body); await load(me) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function logout() { await api('/logout', 'POST'); setMe(null); setItems([]) }
  if (me === undefined) return <div className="boot"><Brand/><p>Загружаем рабочее пространство…</p></div>
  if (me === null) return <Login onLogin={async u => { setMe(u); setView(u.role === 'initiator' ? 'all' : 'inbox'); await load(u) }}/>
  return <div className="app-shell">
    <aside className="app-sidebar">
      <div className="app-sidebar-brand"><Brand/><span>РАБОЧЕЕ ПРОСТРАНСТВО</span></div>
      <nav className="app-nav" aria-label="Основная навигация">
        <button className={view === 'inbox' ? 'app-nav-item active' : 'app-nav-item'} onClick={() => { setView('inbox'); setSelectedId(null) }}><Inbox size={18}/><span>Мои задачи</span><b>{inbox.length}</b></button>
        <button className={view === 'all' ? 'app-nav-item active' : 'app-nav-item'} onClick={() => { setView('all'); setSelectedId(null) }}><Files size={18}/><span>Все заявки</span><b>{items.length}</b></button>
        {me.role === 'manager' && <button className={view === 'analytics' ? 'app-nav-item active' : 'app-nav-item'} onClick={() => setView('analytics')}><LayoutGrid size={18}/><span>Аналитика</span></button>}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><CircleHelp size={18}/><div><strong>Демонстрационная среда</strong><p>Здесь только вымышленные заявки и сотрудники.</p></div></div><span>CODEMASTERS · 2026</span></div>
    </aside>
    <div className="app-main">
      <header className="app-topbar"><div className="breadcrumb">Маршрут <ChevronRight size={14}/> <strong>{view === 'analytics' ? 'Аналитика' : view === 'inbox' ? 'Мои задачи' : 'Заявки'}</strong></div><div className="account"><Avatar className="size-9"><AvatarFallback>{initials(me.name)}</AvatarFallback></Avatar><div><strong>{me.name}</strong><span>{accounts.find(a => a.email === me.email)?.role}</span></div><Button variant="ghost" size="icon" onClick={logout} aria-label="Выйти" title="Выйти"><LogOut size={17}/></Button></div></header>
      <div className="app-content">
        {view === 'analytics' ? <Analytics metrics={metrics} items={items}/> : <>
          <div className="app-page-head"><div><span className="kicker">РАБОЧИЙ СТОЛ / {view === 'inbox' ? '01' : '02'}</span><h1>{view === 'inbox' ? 'Ожидают вашего решения' : 'Все заявки'}</h1><p>{view === 'inbox' ? 'Документы, для которых сейчас нужен ваш ответ.' : 'Текущий статус и вся история согласования в одном месте.'}</p></div><Button className="create-button" onClick={() => setCreating(true)}><Plus size={17}/> Новая заявка</Button></div>
          <div className="quick-stats"><div><span>Всего заявок</span><strong>{String(items.length).padStart(2, '0')}</strong></div><div><span>Требуют вашего решения</span><strong>{String(inbox.length).padStart(2, '0')}</strong></div><div><span>Согласовано</span><strong>{String(items.filter(x => x.status === 'approved').length).padStart(2, '0')}</strong></div></div>
          {error && <div className="app-error" role="alert">{error}<Button variant="ghost" size="icon-sm" onClick={() => setError('')} aria-label="Закрыть ошибку"><X size={16}/></Button></div>}
          <div className="work-grid"><Card className="request-list-card"><CardHeader className="list-card-head"><div><span className="kicker">РЕЕСТР</span><CardTitle>{view === 'inbox' ? 'Входящие' : 'Заявки'}</CardTitle></div><Badge variant="outline">{visible.length}</Badge></CardHeader><CardContent className="request-list-content">{visible.length ? visible.map(x => <button key={x.id} className={selected?.id === x.id ? 'request-row selected' : 'request-row'} onClick={() => setSelectedId(x.id)}><span className="request-row-top"><span>№ {String(x.id).padStart(4, '0')} · {x.type}</span><ChevronRight size={16}/></span><strong>{x.title}</strong><span className="request-row-bottom"><Status value={x.status}/><span>{fmt(x.updatedAt)}</span></span></button>) : <div className="list-empty"><CheckCheck size={32}/><strong>Пока нет задач</strong><p>Новая заявка появится здесь, когда подойдёт ваш этап.</p></div>}</CardContent></Card>
          <Card className="detail-card">{selected ? <Detail key={selected.id} item={selected} me={me} busy={busy} onDecision={(decision, note) => act(`/requests/${selected.id}/decision`, { decision, note })} onResubmit={description => act(`/requests/${selected.id}/resubmit`, { description })}/> : <div className="detail-empty"><RouteIcon size={38}/><h2>Выберите заявку</h2><p>Здесь появится маршрут, ответственные и история решений.</p></div>}</Card></div>
        </>}
      </div>
    </div>
    <CreateModal open={creating} busy={busy} onClose={() => setCreating(false)} onCreate={async data => { setBusy(true); setError(''); try { const x = await api<Item>('/requests', 'POST', data); await load(me); setView('all'); setSelectedId(x.id); setCreating(false) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }}/>
  </div>
}

function Login({ onLogin }: { onLogin: (u: User) => Promise<void> }) {
  const [email, setEmail] = useState(accounts[0].email)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await onLogin(await api<User>('/login', 'POST', { email, password })) } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  return <main className="landing"><div className="landing-frame">
    <header className="landing-nav"><Brand/><nav aria-label="Разделы сайта"><a href="#product">Продукт</a><a href="#workflow">Как работает</a><a href="#demo">Демо</a></nav><Button asChild variant="outline" className="nav-cta"><a href="#demo">Войти <ArrowUpRight size={16}/></a></Button></header>
    <section className="landing-hero"><div className="hero-tag"><span/> CODEMASTERS / ЭФФЕКТИВНОСТЬ 360</div><h1>Согласование,<br/><em>которое видно.</em></h1><p>Заявка больше не теряется между отделами. В одном месте — следующий шаг, ответственный, срок и история решений.</p><Button asChild className="hero-cta"><a href="#demo">Открыть демо <ArrowRight size={18}/></a></Button><span className="hero-note">От заявки до решения — в одном маршруте.</span></section>
    <section className="feature-gallery" id="product" aria-label="Возможности продукта">
      <Card className="feature-card feature-request"><div className="feature-index">01 / ЗАЯВКА</div><div className="request-preview"><div className="preview-caption"><span>№ 0042</span><span className="preview-status"><i/> В работе</span></div><strong>Закупка оборудования</strong><div className="preview-person"><Avatar className="size-7"><AvatarFallback>МО</AvatarFallback></Avatar><span>Сейчас у Максима Орлова</span></div><div className="preview-line"><i/><i/><i/></div></div></Card>
      <Card className="feature-card feature-mint"><div className="feature-index">02 / ПРОЗРАЧНОСТЬ</div><div className="mint-figure"><span>1</span><span>2</span><span>3</span></div><strong>Каждый шаг<br/>на виду.</strong></Card>
      <Card className="feature-card feature-cobalt"><div className="feature-index">03 / РЕШЕНИЕ</div><div className="approval-icon"><Check size={28}/></div><strong>Согласовано.</strong><p>Решение и комментарий остаются в истории заявки.</p></Card>
      <Card className="feature-card feature-lilac"><div className="feature-index">04 / КОНТРОЛЬ</div><div className="stat-figure">3<span>этапа</span></div><p>Руководитель → финансы → юрист</p></Card>
    </section>
    <section className="landing-workflow" id="workflow"><div><span className="kicker">СДЕЛАНО ДЛЯ РЕАЛЬНОЙ РАБОТЫ</span><h2>Не новый лабиринт.<br/>Просто ясный путь.</h2></div><div className="workflow-items"><div><FilePlus2 size={21}/><strong>Создайте заявку</strong><p>Тип документа задаёт маршрут согласования.</p></div><div><RouteIcon size={21}/><strong>Следите за шагами</strong><p>Видно, у кого заявка сейчас и когда истекает срок.</p></div><div><ShieldCheck size={21}/><strong>Примите решение</strong><p>Согласуйте или верните с понятной причиной.</p></div></div></section>
    <section className="landing-access" id="demo"><div className="access-copy"><span className="kicker">ДЕМОНСТРАЦИЯ</span><h2>Зайдите и<br/>посмотрите сами.</h2><p>Выберите одну из четырёх ролей. Демо показывает весь маршрут на вымышленных данных.</p><div className="access-foot"><Sparkles size={17}/> Прототип команды Codemasters · 2026</div></div><Card className="access-card"><CardHeader><div className="access-card-icon"><ArrowUpRight size={20}/></div><CardTitle>Войти в демо</CardTitle><p>Для всех ролей используется один демонстрационный пароль.</p></CardHeader><CardContent><form onSubmit={submit}><div className="form-field"><Label htmlFor="demo-role">Роль</Label><Select value={email} onValueChange={setEmail}><SelectTrigger id="demo-role" className="w-full h-11"><SelectValue/></SelectTrigger><SelectContent>{accounts.map(a => <SelectItem key={a.email} value={a.email}>{a.name} · {a.role}</SelectItem>)}</SelectContent></Select></div><div className="form-field"><Label htmlFor="demo-password">Пароль</Label><Input id="demo-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль демонстрации" required/></div>{error && <p className="form-error" role="alert">{error}</p>}<Button className="access-submit" disabled={busy}>{busy ? 'Входим…' : <>Продолжить <ArrowRight size={17}/></>}</Button></form><p className="demo-disclaimer">Не добавляйте реальные документы или персональные данные.</p></CardContent></Card></section>
    <footer className="landing-footer"><Brand/><span>CODEMASTERS · ФИНТЕХ АКАДЕМИЯ 2026</span></footer>
  </div></main>
}

function Detail({ item, me, busy, onDecision, onResubmit }: { item: Item; me: User; busy: boolean; onDecision: (d: string, n: string) => void; onResubmit: (d: string) => void }) {
  const [note, setNote] = useState('')
  const [description, setDescription] = useState(item.description)
  const canDecide = item.status === 'in_progress' && item.steps[item.currentStep]?.assignee.id === me.id
  const canResubmit = item.status === 'returned' && item.creator.id === me.id
  return <div className="detail-inner"><div className="detail-overline"><span className="kicker">ЗАЯВКА № {String(item.id).padStart(4, '0')}</span><Status value={item.status}/></div><h2>{item.title}</h2><p className="detail-meta">{item.type} <span>·</span> Создана {fmt(item.createdAt)} <span>·</span> {item.creator.name}</p><p className="detail-description">{item.description || 'Описание пока не добавлено.'}</p><Separator/>
    <div className="section-heading"><div><span className="kicker">ПРОЦЕСС</span><h3>Маршрут согласования</h3></div><span>{item.steps.filter(s => s.status === 'approved').length} из {item.steps.length} этапов</span></div>
    <div className="timeline">{item.steps.map(s => <div className={`timeline-step step-${s.status}`} key={s.id}><div className="timeline-number">{s.status === 'approved' ? <Check size={15}/> : String(s.position + 1).padStart(2, '0')}</div><div className="timeline-content"><div><strong>{s.name}</strong><span>{s.status === 'approved' ? 'Готово' : s.status === 'returned' ? 'Возвращено' : s.status === 'active' ? 'Текущий этап' : 'Ожидает'}</span></div><p>{s.assignee.name} <span>·</span> {s.status === 'approved' ? fmtTime(s.completedAt) : `Срок до ${fmt(s.dueAt)}`}</p>{s.note && <blockquote>“{s.note}”</blockquote>}</div></div>)}</div>
    {canDecide && <div className="decision-panel"><div className="decision-panel-head"><FileCheck2 size={20}/><div><span className="kicker">ВАШ ХОД</span><h3>Заявка ожидает решения</h3></div></div><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Комментарий или причина возврата" maxLength={500}/><div><Button disabled={busy} onClick={() => onDecision('approve', note)}>Согласовать <Check size={16}/></Button><Button variant="outline" disabled={busy || note.trim().length < 3} onClick={() => onDecision('return', note)}>Вернуть на доработку</Button></div></div>}
    {canResubmit && <div className="decision-panel"><span className="kicker">ДОРАБОТКА</span><h3>Исправьте описание и отправьте снова</h3><Textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000}/><Button disabled={busy} onClick={() => onResubmit(description)}>Отправить повторно <ArrowRight size={16}/></Button></div>}
    <Separator/><div className="section-heading history-heading"><div><span className="kicker">ЖУРНАЛ</span><h3>История решений</h3></div></div><div className="activity-list">{item.activity.map(a => <div key={a.id} className="activity-item"><span className="activity-marker"/><div><p><strong>{a.actor}</strong> {actionText(a.action)}</p>{a.note && <blockquote>“{a.note}”</blockquote>}<time>{fmtTime(a.createdAt)}</time></div></div>)}</div>
  </div>
}

function CreateModal({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (data: { title: string; type: string; description: string }) => void }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('Закупка')
  const [description, setDescription] = useState('')
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}><DialogContent className="create-dialog"><DialogHeader><div className="dialog-icon"><FilePlus2 size={20}/></div><DialogTitle>Новая заявка</DialogTitle><DialogDescription>Тип документа определит маршрут. Ответственные появятся автоматически.</DialogDescription></DialogHeader><form onSubmit={e => { e.preventDefault(); onCreate({ title, type, description }) }}><div className="form-field"><Label htmlFor="request-title">Название</Label><Input id="request-title" value={title} onChange={e => setTitle(e.target.value)} minLength={5} maxLength={120} placeholder="Например, закупка оборудования" required/></div><div className="form-field"><Label htmlFor="request-type">Тип документа</Label><Select value={type} onValueChange={setType}><SelectTrigger id="request-type" className="w-full h-10"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Закупка">Закупка</SelectItem><SelectItem value="Договор">Договор</SelectItem><SelectItem value="Служебная записка">Служебная записка</SelectItem></SelectContent></Select></div><div className="form-field"><Label htmlFor="request-description">Краткое описание</Label><Textarea id="request-description" value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} placeholder="Что нужно согласовать?"/></div><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Отмена</Button><Button disabled={busy}>{busy ? 'Сохраняем…' : <>Создать заявку <ArrowRight size={16}/></>}</Button></DialogFooter></form></DialogContent></Dialog>
}

function Analytics({ metrics, items }: { metrics: Metrics | null; items: Item[] }) {
  const active = items.filter(x => x.status === 'in_progress')
  const cards = [{ label: 'Всего заявок', value: metrics?.total, Icon: Files }, { label: 'В работе', value: metrics?.active, Icon: Clock3 }, { label: 'Согласовано', value: metrics?.approved, Icon: CheckCheck }, { label: 'Просроченных этапов', value: metrics?.overdueStages, Icon: ShieldCheck }]
  return <div className="analytics-page"><div className="app-page-head"><div><span className="kicker">РАБОЧИЙ СТОЛ / 03</span><h1>Пульс процесса</h1><p>Сводка по демонстрационным заявкам. В пилоте сравним те же показатели с исходной базой.</p></div></div><div className="analytics-cards">{cards.map(({ label, value, Icon }) => <Card key={label} className="metric-card"><CardContent><div><span>{label}</span><Icon size={19}/></div><strong>{String(value ?? '—').padStart(2, '0')}</strong></CardContent></Card>)}</div><div className="analytics-bottom"><Card className="average-card"><CardContent><span className="kicker">СРЕДНЕЕ ВРЕМЯ СОГЛАСОВАНИЯ</span><div><strong>{metrics?.averageHours ?? '—'}</strong><span>часа</span></div><p>По завершённым демо заявкам. Фактический эффект можно измерить только во время пилота.</p></CardContent></Card><Card className="active-card"><CardHeader><span className="kicker">ТЕКУЩИЙ ПОТОК</span><CardTitle>Сейчас в работе</CardTitle></CardHeader><CardContent>{active.length ? active.map(x => <div key={x.id} className="active-row"><div><strong>{x.title}</strong><span>{x.steps[x.currentStep]?.name} · {x.steps[x.currentStep]?.assignee.name}</span></div><Badge variant="outline">{fmt(x.steps[x.currentStep]?.dueAt)}</Badge></div>) : <p className="no-active">Активных заявок нет.</p>}</CardContent></Card></div></div>
}
