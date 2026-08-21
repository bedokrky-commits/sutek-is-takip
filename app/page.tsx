'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '../lib/supabase/client'

type Status = 'pending' | 'in_progress' | 'completed' | 'postponed'
type Role = 'admin' | 'office' | 'service'
type Job = {
  id: string
  scheduled_at: string
  customer_name: string
  customer_phone: string
  description: string
  status: Status
  created_by?: string
  created_by_name?: string
  creator?: { full_name?: string } | null
}
type Notice = { id: string; title?: string; message: string; created_at: string; is_read: boolean; job_id?: string | null }

const statusText: Record<Status, string> = {
  pending: 'Bekliyor',
  in_progress: 'İşlemde',
  completed: 'Tamamlandı',
  postponed: 'Ertelendi'
}
const roleText: Record<Role, string> = { admin: 'Yönetici', office: 'Ofis', service: 'Servis' }

const seedJobs: Job[] = [{
  id: 'demo-1', scheduled_at: new Date().toISOString(), customer_name: 'Örnek Müşteri',
  customer_phone: '0532 000 00 00', description: 'Klima arıza kontrolü', status: 'pending',
  created_by_name: 'Ofis Kullanıcısı'
}]

function localDateInputValue() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export default function Home() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [jobs, setJobs] = useState<Job[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showNotices, setShowNotices] = useState(false)
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(!configured)
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [profileName, setProfileName] = useState('SUTEK Kullanıcısı')
  const [role, setRole] = useState<Role>('office')
  const [filter, setFilter] = useState<'bugun' | 'bekleyen' | 'tamamlanan'>('bugun')
  const [search, setSearch] = useState('')
  const [historyPhone, setHistoryPhone] = useState<string | null>(null)

  async function load() {
    if (!supabase) {
      const local = localStorage.getItem('demo-jobs')
      const localNotices = localStorage.getItem('demo-notices')
      setJobs(local ? JSON.parse(local) : seedJobs)
      setNotices(localNotices ? JSON.parse(localNotices) : [])
      setLoading(false)
      return
    }

    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    setSignedIn(Boolean(user))
    if (!user) { setLoading(false); return }

    const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
    if (profile) {
      setProfileName(profile.full_name)
      setRole(profile.role as Role)
    }
    const [{ data }, { data: ns }] = await Promise.all([
      supabase.from('jobs').select('*, creator:profiles!jobs_created_by_fkey(full_name)').order('scheduled_at', { ascending: true }),
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
    ])
    setJobs((data ?? []) as Job[])
    setNotices((ns ?? []) as Notice[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    if (!supabase) return
    const { data: listener } = supabase.auth.onAuthStateChange(() => load())
    return () => listener.subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (!supabase || !signedIn) return
    const channel = supabase.channel('team-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, signedIn])

  function persistDemo(next: Job[]) {
    setJobs(next)
    localStorage.setItem('demo-jobs', JSON.stringify(next))
  }

  function persistDemoNotices(next: Notice[]) {
    setNotices(next)
    localStorage.setItem('demo-notices', JSON.stringify(next))
  }

  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase) return
    setAuthBusy(true); setAuthMessage('')
    const fd = new FormData(e.currentTarget)
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get('email')),
      password: String(fd.get('password'))
    })
    setAuthBusy(false)
    if (error) return setAuthMessage('Giriş yapılamadı: ' + error.message)
    await load()
  }

  async function signUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase) return
    setAuthBusy(true); setAuthMessage('')
    const fd = new FormData(e.currentTarget)
    const { error } = await supabase.auth.signUp({
      email: String(fd.get('email')),
      password: String(fd.get('password')),
      options: { data: { full_name: String(fd.get('full_name')) } }
    })
    setAuthBusy(false)
    if (error) return setAuthMessage('Kullanıcı oluşturulamadı: ' + error.message)
    setAuthMessage('Kullanıcı oluşturuldu. E-posta doğrulaması açıksa gelen kutusundan onaylayın. Yeni hesap varsayılan olarak Ofis rolünde açılır.')
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setJobs([]); setNotices([]); setSignedIn(false)
  }

  async function createJob(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const scheduled = new Date(`${fd.get('date')}T${fd.get('time')}`)
    const job = {
      scheduled_at: scheduled.toISOString(),
      customer_name: String(fd.get('customer_name')).trim(),
      customer_phone: String(fd.get('customer_phone')).trim(),
      description: String(fd.get('description')).trim(),
          }
    if (!supabase) {
      const newJob: Job = { id: crypto.randomUUID(), ...job, status: 'pending', created_by_name: profileName }
      persistDemo([...jobs, newJob])
      persistDemoNotices([{ id: crypto.randomUUID(), message: `${job.customer_name} için yeni servis işi eklendi.`, created_at: new Date().toISOString(), is_read: false, job_id: newJob.id }, ...notices])
    } else {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return alert('Önce kullanıcı girişi yapılmalı.')
      const { error } = await supabase.from('jobs').insert({ ...job, created_by: auth.user.id })
      if (error) return alert(error.message)
      await load()
    }
    setShowForm(false)
    e.currentTarget.reset()
  }

  async function setStatus(job: Job, status: Status) {
    let newDate: Date | null = null
    if (status === 'postponed') {
      const date = prompt('Yeni tarih ve saat (YYYY-MM-DD HH:MM)')
      if (!date) return
      newDate = new Date(date.replace(' ', 'T'))
      if (Number.isNaN(newDate.getTime())) return alert('Geçerli tarih-saat girin.')
    }

    if (!supabase) {
      const updated = jobs.map(j => j.id === job.id ? { ...j, status, ...(newDate ? { scheduled_at: newDate.toISOString() } : {}) } : j)
      persistDemo(updated)
      const msg = status === 'completed' ? `${job.customer_name} işi tamamlandı.` : status === 'postponed' ? `${job.customer_name} işi ertelendi.` : `${job.customer_name} işi işlemde.`
      persistDemoNotices([{ id: crypto.randomUUID(), message: msg, created_at: new Date().toISOString(), is_read: false, job_id: job.id }, ...notices])
      return
    }

    const patch: Record<string, string> = { status }
    if (status === 'completed') patch.completed_at = new Date().toISOString()
    if (newDate) { patch.scheduled_at = newDate.toISOString(); patch.postponement_reason = 'Yeni tarihe ertelendi' }
    const { error } = await supabase.from('jobs').update(patch).eq('id', job.id)
    if (error) return alert(error.message)
    await load()
  }

  async function markAllRead() {
    if (!supabase) {
      persistDemoNotices(notices.map(n => ({ ...n, is_read: true })))
      return
    }
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', auth.user.id).eq('is_read', false)
    await load()
  }

  function changeDemoRole(nextRole: Role) {
    setRole(nextRole)
    setProfileName(nextRole === 'service' ? 'Servis Kullanıcısı' : nextRole === 'admin' ? 'Yönetici' : 'Ofis Kullanıcısı')
  }

  if (configured && !signedIn && !loading) {
    return <main className="authShell">
      <section className="authCard">
        <div className="brand authBrand"><img className="brandLogo" src="/sutek-logo.png" alt="SUTEK"/><div><b>SUTEK İş Takip</b><small>Ofis & Servis</small></div></div>
        <h1>Personel Girişi</h1><p className="muted">İş programını görüntülemek için hesabınızla giriş yapın.</p>
        <form className="authForm" onSubmit={signIn}>
          <label>E-posta<input name="email" type="email" required placeholder="personel@firma.com" /></label>
          <label>Şifre<input name="password" type="password" required minLength={6} /></label>
          <button className="primary" disabled={authBusy}>{authBusy ? 'Giriş yapılıyor…' : 'Giriş Yap'}</button>
        </form>
        <details className="signupBox"><summary>İlk kullanıcıyı oluştur</summary><form className="authForm" onSubmit={signUp}>
          <label>Ad Soyad<input name="full_name" required /></label>
          <label>E-posta<input name="email" type="email" required /></label>
          <label>Şifre<input name="password" type="password" required minLength={6} /></label>
          <button disabled={authBusy}>Kullanıcı Oluştur</button>
        </form></details>
        {authMessage && <div className="authMessage">{authMessage}</div>}
      </section>
    </main>
  }

  const today = new Date().toDateString()
  const visible = jobs.filter(j => {
    if (filter === 'bekleyen') return j.status !== 'completed'
    if (filter === 'tamamlanan') return j.status === 'completed'
    return new Date(j.scheduled_at).toDateString() === today
  })
  const searched = visible.filter(j => !search.trim() || `${j.customer_name} ${j.customer_phone} ${j.description}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
  const historyJobs = historyPhone ? jobs.filter(j => j.customer_phone === historyPhone).sort((a,b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)) : []
  const canCreate = role === 'office' || role === 'admin'
  const canOperate = role === 'service' || role === 'admin'
  const unread = notices.filter(n => !n.is_read).length

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><img className="brandLogo" src="/sutek-logo.png" alt="SUTEK"/><div><b>SUTEK</b><small>İş Takip Sistemi</small></div></div>
        <nav>
          <button className={filter === 'bugun' ? 'active' : ''} onClick={() => setFilter('bugun')}>Bugünün İşleri</button>
          <button className={filter === 'bekleyen' ? 'active' : ''} onClick={() => setFilter('bekleyen')}>Bekleyen İşler</button>
          <button className={filter === 'tamamlanan' ? 'active' : ''} onClick={() => setFilter('tamamlanan')}>Tamamlananlar</button>
        </nav>
        <div className="sidebarBottom"><span>{profileName}</span><small>{roleText[role]}</small>{configured && <button className="signOut" onClick={signOut}>Çıkış yap</button>}</div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><h1>İş Programı</h1><p>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(new Date())}</p></div>
          <div className="topActions"><button className="noticeBtn" onClick={() => setShowNotices(v => !v)}>🔔 <b>{unread}</b></button>{canCreate && <button className="primary" onClick={() => setShowForm(true)}>+ Yeni İş</button>}</div>
        </header>

        {!configured && <div className="demoBanner"><div><b>Demo modu:</b> Veriler bu tarayıcıda saklanır. Rol değiştirerek Ofis ve Servis ekranlarını deneyebilirsiniz.</div><div className="roleSwitcher">{(['office','service','admin'] as Role[]).map(r => <button key={r} className={role === r ? 'selected' : ''} onClick={() => changeDemoRole(r)}>{roleText[r]}</button>)}</div></div>}

        {showNotices && <div className="noticePanel"><div className="noticeHead"><h3>Bildirimler</h3><button onClick={markAllRead}>Tümünü okundu yap</button></div>{notices.length === 0 ? <p className="muted">Henüz bildirim yok.</p> : notices.map(n => <article key={n.id} className={n.is_read ? 'read' : ''}><span>{n.message}</span><small>{new Date(n.created_at).toLocaleString('tr-TR')}</small></article>)}</div>}

        <div className="stats">
          <article><span>Bugünkü iş</span><strong>{jobs.filter(j => new Date(j.scheduled_at).toDateString() === today).length}</strong></article>
          <article><span>Bekleyen</span><strong>{jobs.filter(j => j.status === 'pending' || j.status === 'in_progress').length}</strong></article>
          <article><span>Tamamlanan</span><strong>{jobs.filter(j => j.status === 'completed').length}</strong></article>
          <article><span>Ertelenen</span><strong>{jobs.filter(j => j.status === 'postponed').length}</strong></article>
        </div>

        <div className="panel">
          <div className="panelHead"><div><h2>{filter === 'bugun' ? 'Bugünün İşleri' : filter === 'bekleyen' ? 'Bekleyen İşler' : 'Tamamlanan İşler'}</h2><input className="searchInput" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Müşteri, telefon veya iş ara…" /></div><span>{searched.length} kayıt</span></div>
          {loading ? <div className="empty">Yükleniyor…</div> : searched.length === 0 ? <div className="empty">Bu bölümde iş bulunmuyor.</div> : (
            <div className="jobList">{searched.map(job => (
              <article className="job" key={job.id}>
                <div className="time"><strong>{new Date(job.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</strong><small>{new Date(job.scheduled_at).toLocaleDateString('tr-TR')}</small></div>
                <div className="jobInfo"><div className="jobTitle"><h3>{job.customer_name}</h3><span className={`badge ${job.status}`}>{statusText[job.status]}</span></div><a href={`tel:${job.customer_phone}`}>{job.customer_phone}</a><p>{job.description}</p><small>Ekleyen: <b>{job.creator?.full_name || job.created_by_name || 'SUTEK Personeli'}</b></small></div>
                <div className="actions"><button onClick={() => setHistoryPhone(job.customer_phone)}>Geçmiş</button>
                  {canOperate && job.status !== 'completed' && <><button onClick={() => setStatus(job, 'in_progress')}>İşleme Al</button><button className="success" onClick={() => setStatus(job, 'completed')}>✓ Tamamlandı</button><button className="warning" onClick={() => setStatus(job, 'postponed')}>↻ Ertele</button></>}
                  {!canOperate && job.status !== 'completed' && <span className="roleHint">Durumu servis günceller</span>}
                </div>
              </article>
            ))}</div>
          )}
        </div>
      </section>

      {historyPhone && <div className="modalBackdrop" onMouseDown={() => setHistoryPhone(null)}><div className="modal historyModal" onMouseDown={e => e.stopPropagation()}><div className="modalHead"><div><h2>Müşteri Geçmişi</h2><p>{historyPhone} · {historyJobs.length} kayıt</p></div><button onClick={() => setHistoryPhone(null)}>×</button></div><div className="historyList">{historyJobs.map(h => <article key={h.id}><div><b>{new Date(h.scheduled_at).toLocaleString('tr-TR')}</b><span className={`badge ${h.status}`}>{statusText[h.status]}</span></div><h3>{h.customer_name}</h3><p>{h.description}</p></article>)}</div></div></div>}

      {showForm && <div className="modalBackdrop" onMouseDown={() => setShowForm(false)}><div className="modal" onMouseDown={e => e.stopPropagation()}><div className="modalHead"><div><h2>Yeni İş Ekle</h2><p>İş servis bölümüne iletilecek.</p></div><button onClick={() => setShowForm(false)}>×</button></div><form onSubmit={createJob}><div className="grid2"><label>Tarih<input name="date" type="date" required defaultValue={localDateInputValue()} /></label><label>Saat<input name="time" type="time" required /></label></div><label>Müşteri Adı<input name="customer_name" required placeholder="Ad Soyad / Firma" /></label><label>Telefon<input name="customer_phone" required inputMode="tel" placeholder="05xx xxx xx xx" /></label><label>Yapılacak İş<textarea name="description" required rows={4} placeholder="Servisin yapacağı işi yazın…" /></label><div className="creator">Ekleyen kişi otomatik kaydedilecek: <b>{profileName}</b></div><div className="formActions"><button type="button" onClick={() => setShowForm(false)}>Vazgeç</button><button className="primary" type="submit">İşi Oluştur</button></div></form></div></div>}
    </main>
  )
}
