'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '../lib/supabase/client'
import './v06-additions.css'

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
  customer_report?: string | null
  report_updated_at?: string | null
  assigned_to?: string | null
  priority?: 'normal' | 'urgent'
  assignee?: { full_name?: string } | null
}
type Attachment = {
  id: string
  job_id: string
  file_name: string
  storage_path: string
  mime_type?: string | null
  file_size?: number | null
  created_at: string
}
type Notice = { id: string; title?: string; message: string; created_at: string; is_read: boolean; job_id?: string | null }
type Profile = { id: string; full_name: string; email?: string | null; role: Role; is_active: boolean; phone?: string | null }
type JobHistory = { id: string; job_id: string; new_status: Status; created_at: string; changed_by?: string | null; changer?: { full_name?: string; role?: Role } | null }

const statusText: Record<Status, string> = {
  pending: 'Bekliyor',
  in_progress: 'İşlemde',
  completed: 'Tamamlandı',
  postponed: 'Ertelendi'
}
const roleText: Record<Role, string> = { admin: 'Yönetici', office: 'Ofis', service: 'Servis' }

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
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [jobHistory, setJobHistory] = useState<JobHistory[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [filesJob, setFilesJob] = useState<Job | null>(null)
  const [reportJob, setReportJob] = useState<Job | null>(null)
  const [reportDraft, setReportDraft] = useState('')
  const [fileBusy, setFileBusy] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [serviceProfiles, setServiceProfiles] = useState<Profile[]>([])
  const [editJob, setEditJob] = useState<Job | null>(null)
  const [jobQuickFilter, setJobQuickFilter] = useState<'all' | 'urgent' | 'late' | 'upcoming'>('all')
  const [signedIn, setSignedIn] = useState(!configured)
  const [loading, setLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [profileName, setProfileName] = useState('SUTEK Kullanıcısı')
  const [role, setRole] = useState<Role>('office')
  const [filter, setFilter] = useState<'bugun' | 'bekleyen' | 'tamamlanan'>('bugun')
  const [view, setView] = useState<'jobs' | 'personnel' | 'customers' | 'reports'>('jobs')
  const [search, setSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [historyPhone, setHistoryPhone] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showNotices, setShowNotices] = useState(false)
  const [showPersonnelForm, setShowPersonnelForm] = useState(false)
  const [personnelBusy, setPersonnelBusy] = useState(false)
  const [personnelMessage, setPersonnelMessage] = useState('')
  const [reportStart, setReportStart] = useState('')
  const [reportEnd, setReportEnd] = useState('')

  async function load() {
    if (!supabase) { setLoading(false); return }
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    setSignedIn(Boolean(user))
    if (!user) { setLoading(false); return }

    const { data: profile } = await supabase.from('profiles').select('full_name,role,is_active').eq('id', user.id).single()
    if (profile) {
      if (!profile.is_active) {
        await supabase.auth.signOut()
        setSignedIn(false)
        setAuthMessage('Bu kullanıcı hesabı pasif durumda.')
        setLoading(false)
        return
      }
      setProfileName(profile.full_name)
      setRole(profile.role as Role)
    }

    const [{ data: js }, { data: ns }, { data: hs }, { data: at }] = await Promise.all([
      supabase.from('jobs').select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)').order('scheduled_at', { ascending: true }),
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('job_status_history').select('id,job_id,new_status,created_at,changed_by,changer:profiles!job_status_history_changed_by_fkey(full_name,role)').order('created_at', { ascending: true }),
      supabase.from('job_attachments').select('id,job_id,file_name,storage_path,mime_type,file_size,created_at').order('created_at', { ascending: false })
    ])
    setJobs((js ?? []) as Job[])
    setNotices((ns ?? []) as Notice[])
    setJobHistory((hs ?? []) as JobHistory[])
    setAttachments((at ?? []) as Attachment[])

    if (profile?.role === 'admin') {
      const { data: ps } = await supabase.from('profiles').select('id,full_name,email,role,is_active,phone').order('full_name')
      setProfiles((ps ?? []) as Profile[])
      setServiceProfiles(((ps ?? []) as Profile[]).filter(p => p.role === 'service' && p.is_active))
    } else if (profile?.role === 'office') {
      setProfiles([])
      const { data: servicePs } = await supabase.from('profiles').select('id,full_name,email,role,is_active,phone').eq('role','service').eq('is_active',true).order('full_name')
      setServiceProfiles((servicePs ?? []) as Profile[])
      if (view === 'personnel') setView('jobs')
    } else {
      setProfiles([])
      setServiceProfiles([])
      if (view === 'personnel' || view === 'reports') setView('jobs')
    }
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

    async function refreshSingleJob(jobId: string) {
      const { data } = await supabase
        .from('jobs')
        .select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)')
        .eq('id', jobId)
        .single()
      if (!data) return
      const nextJob = data as Job
      setJobs(current => {
        const exists = current.some(j => j.id === nextJob.id)
        const next = exists
          ? current.map(j => j.id === nextJob.id ? nextJob : j)
          : [...current, nextJob]
        return next.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
      })
    }

    const channel = supabase.channel(`team-live-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, payload => {
        const id = String((payload.new as { id?: string })?.id || '')
        if (id) void refreshSingleJob(id)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, payload => {
        const id = String((payload.new as { id?: string })?.id || '')
        if (id) void refreshSingleJob(id)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'jobs' }, payload => {
        const id = String((payload.old as { id?: string })?.id || '')
        if (id) setJobs(current => current.filter(j => j.id !== id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
        const notice = payload.new as Notice & { user_id?: string }
        void supabase.auth.getUser().then(({ data }) => {
          if (data.user?.id && notice.user_id === data.user.id) {
            setNotices(current => current.some(n => n.id === notice.id) ? current : [notice, ...current].slice(0, 30))
          }
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, payload => {
        const notice = payload.new as Notice
        setNotices(current => current.map(n => n.id === notice.id ? notice : n))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_attachments' }, payload => {
        const file = payload.new as Attachment
        setAttachments(current => current.some(a => a.id === file.id) ? current : [file, ...current])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'job_attachments' }, payload => {
        const id = String((payload.old as { id?: string })?.id || '')
        if (id) setAttachments(current => current.filter(a => a.id !== id))
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [supabase, signedIn])

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

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSignedIn(false)
  }

  async function createJob(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase) return
    const form = e.currentTarget
    const fd = new FormData(form)
    const scheduled = new Date(`${fd.get('date')}T${fd.get('time')}`)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data, error } = await supabase.from('jobs').insert({
      scheduled_at: scheduled.toISOString(),
      customer_name: String(fd.get('customer_name')).trim(),
      customer_phone: String(fd.get('customer_phone')).trim(),
      description: String(fd.get('description')).trim(),
      priority: String(fd.get('priority') || 'normal') === 'urgent' ? 'urgent' : 'normal',
      assigned_to: String(fd.get('assigned_to') || '') || null,
      created_by: auth.user.id
    }).select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)').single()
    if (error) return alert(error.message)

    if (data) {
      const newJob = data as Job
      setJobs(current => {
        if (current.some(j => j.id === newJob.id)) return current
        return [...current, newJob].sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
      })
    }
    setShowForm(false)
    form.reset()
  }

  async function setStatus(job: Job, status: Status) {
    if (!supabase) return
    const patch: Record<string, string> = { status }
    if (status === 'completed') patch.completed_at = new Date().toISOString()
    if (status === 'postponed') patch.postponement_reason = 'Servis tarafından ertelendi; yeni tarih Ofis/Yönetici tarafından belirlenecek'

    const previous = job
    setJobs(current => current.map(j => j.id === job.id ? { ...j, ...patch } as Job : j))

    const { data, error } = await supabase.from('jobs')
      .update(patch)
      .eq('id', job.id)
      .select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)')
      .single()

    if (error) {
      setJobs(current => current.map(j => j.id === job.id ? previous : j))
      return alert(error.message)
    }
    if (data) setJobs(current => current.map(j => j.id === job.id ? data as Job : j))
  }

  async function rescheduleJob(job: Job) {
    if (!supabase || !['office', 'admin'].includes(role)) return
    const date = prompt('Yeni tarih ve saat (YYYY-MM-DD HH:MM)')
    if (!date) return
    const parsed = new Date(date.replace(' ', 'T'))
    if (Number.isNaN(parsed.getTime())) return alert('Geçerli tarih-saat girin.')
    const { data, error } = await supabase.functions.invoke('office-reschedule-job', {
      body: { job_id: job.id, scheduled_at: parsed.toISOString() }
    })
    if (error || data?.error) return alert(data?.error || error?.message || 'Tarih güncellenemedi.')
    const { data: updated } = await supabase.from('jobs')
      .select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)')
      .eq('id', job.id).single()
    if (updated) setJobs(current => current.map(j => j.id === job.id ? updated as Job : j))
  }

  async function saveJobEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase || !editJob || !['office', 'admin'].includes(role)) return
    const fd = new FormData(e.currentTarget)
    const scheduled = new Date(`${fd.get('date')}T${fd.get('time')}`)
    const { data, error } = await supabase.functions.invoke('update-job-details', {
      body: {
        job_id: editJob.id,
        customer_name: String(fd.get('customer_name')).trim(),
        customer_phone: String(fd.get('customer_phone')).trim(),
        description: String(fd.get('description')).trim(),
        scheduled_at: scheduled.toISOString(),
        priority: String(fd.get('priority') || 'normal'),
        assigned_to: String(fd.get('assigned_to') || '') || null
      }
    })
    if (error || data?.error) return alert(data?.error || error?.message || 'İş düzenlenemedi.')
    const editedId = editJob.id
    setEditJob(null)
    const { data: updated } = await supabase.from('jobs')
      .select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)')
      .eq('id', editedId).single()
    if (updated) {
      setJobs(current => current.map(j => j.id === editedId ? updated as Job : j)
        .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)))
    }
  }

  function localDateForJob(value: string) {
    const d = new Date(value)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0,10)
  }

  function localTimeForJob(value: string) {
    const d = new Date(value)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return local.toISOString().slice(11,16)
  }

  async function uploadJobFile(job: Job) {
    if (!supabase) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (file.size > 10 * 1024 * 1024) return alert('Dosya en fazla 10 MB olabilir.')
      setFileBusy(true)
      try {
        const { data: auth } = await supabase.auth.getUser()
        if (!auth.user) return alert('Oturum bulunamadı.')
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${auth.user.id}/${job.id}/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage.from('job-files').upload(path, file, { upsert: false })
        if (uploadError) return alert('Dosya yüklenemedi: ' + uploadError.message)
        const { error: rowError } = await supabase.from('job_attachments').insert({
          job_id: job.id,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          file_size: file.size,
          uploaded_by: auth.user.id
        })
        if (rowError) {
          await supabase.storage.from('job-files').remove([path])
          return alert('Dosya kaydı oluşturulamadı: ' + rowError.message)
        }
        const { data: createdFile } = await supabase.from('job_attachments')
          .select('id,job_id,file_name,storage_path,mime_type,file_size,created_at')
          .eq('storage_path', path).single()
        if (createdFile) setAttachments(current => current.some(a => a.id === createdFile.id) ? current : [createdFile as Attachment, ...current])
        setFilesJob(job)
      } finally {
        setFileBusy(false)
      }
    }
    input.click()
  }

  async function openAttachment(file: Attachment) {
    if (!supabase) return
    const { data, error } = await supabase.storage.from('job-files').createSignedUrl(file.storage_path, 60 * 10)
    if (error || !data?.signedUrl) return alert('Dosya açılamadı.')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function deleteAttachment(file: Attachment) {
    if (!supabase) return
    if (!confirm(`${file.file_name} dosyasını silmek istediğinize emin misiniz?`)) return
    const { error: storageError } = await supabase.storage.from('job-files').remove([file.storage_path])
    if (storageError) return alert('Dosya silinemedi: ' + storageError.message)
    const { error } = await supabase.from('job_attachments').delete().eq('id', file.id)
    if (error) return alert('Dosya kaydı silinemedi: ' + error.message)
    setAttachments(current => current.filter(a => a.id !== file.id))
  }

  function openReport(job: Job) {
    setReportJob(job)
    setReportDraft(job.customer_report || '')
  }

  async function saveCustomerReport() {
    if (!supabase || !reportJob || !['service', 'admin'].includes(role)) return
    const report = reportDraft.trim()
    if (!report) return alert('Müşteri raporu boş olamaz.')
    setReportBusy(true)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setReportBusy(false); return }
    const { error } = await supabase.from('jobs').update({
      customer_report: report,
      report_updated_at: new Date().toISOString(),
      report_updated_by: auth.user.id
    }).eq('id', reportJob.id)
    setReportBusy(false)
    if (error) return alert('Rapor kaydedilemedi: ' + error.message)
    const updatedAt = new Date().toISOString()
    setJobs(current => current.map(j => j.id === reportJob.id ? { ...j, customer_report: report, report_updated_at: updatedAt } : j))
    setReportJob(null)
  }

  function whatsappCustomerReport(job: Job) {
    const report = (job.customer_report || '').trim()
    if (!report) return alert('Bu iş için henüz müşteri raporu yazılmamış.')
    let phone = job.customer_phone.replace(/\D/g, '')
    if (phone.startsWith('0')) phone = '90' + phone.slice(1)
    else if (phone.startsWith('5')) phone = '90' + phone
    const message = `SUTEK Servis Raporu\nMüşteri: ${job.customer_name}\n\n${report}`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  async function deleteJob(job: Job) {
    if (!supabase || !['office', 'admin'].includes(role)) return
    if (!confirm(`${job.customer_name} için girilen işi tamamen silmek istediğinize emin misiniz?`)) return
    const { data, error } = await supabase.functions.invoke('delete-job', {
      body: { job_id: job.id }
    })
    if (error || data?.error) return alert(data?.error || error?.message || 'İş silinemedi.')
    if (historyPhone === job.customer_phone) setHistoryPhone(null)
    setJobs(current => current.filter(j => j.id !== job.id))
    setAttachments(current => current.filter(a => a.job_id !== job.id))
  }

  function inReportRange(value: string) {
    const d = new Date(value)
    if (reportStart) {
      const start = new Date(`${reportStart}T00:00:00`)
      if (d < start) return false
    }
    if (reportEnd) {
      const end = new Date(`${reportEnd}T23:59:59.999`)
      if (d > end) return false
    }
    return true
  }

  function reportRangeText() {
    if (!reportStart && !reportEnd) return 'Tüm zamanlar'
    const start = reportStart ? new Date(`${reportStart}T00:00:00`).toLocaleDateString('tr-TR') : 'Başlangıç'
    const end = reportEnd ? new Date(`${reportEnd}T00:00:00`).toLocaleDateString('tr-TR') : 'Bugün'
    return `${start} - ${end}`
  }

  function downloadExcelReport() {
    const rows = [
      ['SUTEK İş Takip Raporu'],
      ['Tarih Aralığı', reportRangeText()],
      [],
      ['Özet'],
      ['Toplam İş', String(reportJobs.length)],
      ['Tamamlanan', String(reportJobs.filter(j => j.status === 'completed').length)],
      ['Ertelenen', String(reportJobs.filter(j => j.status === 'postponed').length)],
      ['Bekleyen / İşlemde', String(reportJobs.filter(j => j.status === 'pending' || j.status === 'in_progress').length)],
      [],
      ['İşi Ekleyen Personel', 'Toplam', 'Tamamlanan', 'Ertelenen', 'Bekleyen'],
      ...reportCreatorReports.map(r => [r.name, String(r.total), String(r.completed), String(r.postponed), String(r.pending)]),
      [],
      ['Servis Personeli', 'Tamamladı', 'Erteledi', 'Toplam İşlem'],
      ...serviceReports.map(r => [r.name, String(r.completed), String(r.postponed), String(r.completed + r.postponed)]),
      [],
      ['İş Listesi'],
      ['Tarih', 'Müşteri', 'Telefon', 'İş', 'Durum', 'Ekleyen'],
      ...reportJobs.map(j => [
        new Date(j.scheduled_at).toLocaleString('tr-TR'),
        j.customer_name,
        j.customer_phone,
        j.description,
        statusText[j.status],
        j.creator?.full_name || j.created_by_name || 'Bilinmeyen'
      ])
    ]
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${
      rows.map(row => `<tr>${row.map(cell => `<td>${String(cell ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>`).join('')}</tr>`).join('')
    }</table></body></html>`
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SUTEK-Rapor-${new Date().toISOString().slice(0,10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printPdfReport() {
    const popup = window.open('', '_blank', 'width=1000,height=800')
    if (!popup) return alert('PDF penceresi açılamadı. Tarayıcı açılır pencere iznini kontrol edin.')
    const creatorRows = reportCreatorReports.map(r => `<tr><td>${r.name}</td><td>${r.total}</td><td>${r.completed}</td><td>${r.postponed}</td><td>${r.pending}</td></tr>`).join('')
    const serviceRows = serviceReports.map(r => `<tr><td>${r.name}</td><td>${r.completed}</td><td>${r.postponed}</td><td>${r.completed + r.postponed}</td></tr>`).join('')
    const jobRows = reportJobs.map(j => `<tr><td>${new Date(j.scheduled_at).toLocaleString('tr-TR')}</td><td>${j.customer_name}</td><td>${j.customer_phone}</td><td>${j.description}</td><td>${statusText[j.status]}</td><td>${j.creator?.full_name || j.created_by_name || 'Bilinmeyen'}</td></tr>`).join('')
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>SUTEK Rapor</title><style>
      body{font-family:Arial,sans-serif;color:#111;padding:28px}h1{margin:0}small{color:#666}
      .summary{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}.summary div{border:1px solid #ddd;border-radius:8px;padding:10px 14px}
      table{width:100%;border-collapse:collapse;margin:14px 0 28px;font-size:12px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f2f2f2}
      h2{font-size:17px;margin-top:24px}@media print{button{display:none}body{padding:0}}
    </style></head><body>
      <h1>SUTEK İş Takip Raporu</h1><small>${reportRangeText()}</small>
      <div class="summary">
        <div><b>${reportJobs.length}</b><br>Toplam</div>
        <div><b>${reportJobs.filter(j => j.status === 'completed').length}</b><br>Tamamlanan</div>
        <div><b>${reportJobs.filter(j => j.status === 'postponed').length}</b><br>Ertelenen</div>
        <div><b>${reportJobs.filter(j => j.status === 'pending' || j.status === 'in_progress').length}</b><br>Bekleyen / İşlemde</div>
      </div>
      <h2>İşi Ekleyen Personel</h2>
      <table><thead><tr><th>Personel</th><th>Toplam</th><th>Tamamlanan</th><th>Ertelenen</th><th>Bekleyen</th></tr></thead><tbody>${creatorRows}</tbody></table>
      <h2>Servis Personeli</h2>
      <table><thead><tr><th>Servis Personeli</th><th>Tamamladı</th><th>Erteledi</th><th>Toplam İşlem</th></tr></thead><tbody>${serviceRows}</tbody></table>
      <h2>İş Listesi</h2>
      <table><thead><tr><th>Tarih</th><th>Müşteri</th><th>Telefon</th><th>İş</th><th>Durum</th><th>Ekleyen</th></tr></thead><tbody>${jobRows}</tbody></table>
      <button onclick="window.print()">PDF / Yazdır</button>
      <script>setTimeout(()=>window.print(),400)</script>
    </body></html>`)
    popup.document.close()
  }

  async function markAllRead() {
    if (!supabase) return
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', auth.user.id).eq('is_read', false)
    await load()
  }

  async function createPersonnel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase || role !== 'admin') return
    setPersonnelBusy(true); setPersonnelMessage('')
    const fd = new FormData(e.currentTarget)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        action: 'create',
        full_name: String(fd.get('full_name')).trim(),
        email: String(fd.get('email')).trim(),
        password: String(fd.get('password')),
        role: String(fd.get('role'))
      }
    })
    setPersonnelBusy(false)
    if (error || data?.error) return setPersonnelMessage('Personel oluşturulamadı: ' + (data?.error || error?.message || 'Bilinmeyen hata'))
    setPersonnelMessage('Personel oluşturuldu ve girişe hazır.')
    e.currentTarget.reset()
    await load()
  }

  async function updatePersonnel(person: Profile, patch: Partial<Profile>) {
    if (!supabase || role !== 'admin') return
    setPersonnelBusy(true); setPersonnelMessage('')
    const next = { ...person, ...patch }
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { action: 'update', user_id: person.id, full_name: next.full_name, role: next.role, is_active: next.is_active }
    })
    setPersonnelBusy(false)
    if (error || data?.error) return setPersonnelMessage('Güncelleme yapılamadı: ' + (data?.error || error?.message || 'Bilinmeyen hata'))
    setPersonnelMessage('Personel bilgileri güncellendi.')
    await load()
  }

  async function deletePersonnel(person: Profile) {
    if (!supabase || role !== 'admin') return
    if (!confirm(`${person.full_name} kullanıcısını tamamen silmek istediğinize emin misiniz?`)) return
    setPersonnelBusy(true); setPersonnelMessage('')
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { action: 'delete', user_id: person.id }
    })
    setPersonnelBusy(false)
    if (error || data?.error) return setPersonnelMessage('Kullanıcı silinemedi: ' + (data?.error || error?.message || 'Bilinmeyen hata'))
    setPersonnelMessage('Kullanıcı silindi.')
    await load()
  }

  if (configured && !signedIn && !loading) {
    return <main className="authShell">
      <section className="authCard">
        <div className="brand authBrand"><img className="brandLogo" src="/sutek-logo.png" alt="SUTEK"/><div><b>SUTEK İş Takip</b><small>Ofis & Servis</small></div></div>
        <h1>Personel Girişi</h1>
        <form className="authForm" onSubmit={signIn}>
          <label>E-posta<input name="email" type="email" required /></label>
          <label>Şifre<input name="password" type="password" required minLength={6} /></label>
          <button className="primary" disabled={authBusy}>{authBusy ? 'Giriş yapılıyor…' : 'Giriş Yap'}</button>
        </form>
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
  const searchedBase = visible.filter(j => !search.trim() || `${j.customer_name} ${j.customer_phone} ${j.description} ${j.assignee?.full_name || ''}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
  const nowMs = Date.now()
  const searched = searchedBase.filter(j => {
    if (jobQuickFilter === 'urgent') return j.priority === 'urgent' && j.status !== 'completed'
    if (jobQuickFilter === 'late') return j.status !== 'completed' && new Date(j.scheduled_at).getTime() < nowMs
    if (jobQuickFilter === 'upcoming') {
      const diff = new Date(j.scheduled_at).getTime() - nowMs
      return j.status !== 'completed' && diff >= 0 && diff <= 2 * 60 * 60 * 1000
    }
    return true
  })
  const historyJobs = historyPhone ? jobs.filter(j => j.customer_phone === historyPhone).sort((a,b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)) : []
  const canCreate = role === 'office' || role === 'admin'
  const canOperate = role === 'service' || role === 'admin'
  const canSchedule = role === 'office' || role === 'admin'
  const canSeeReports = role === 'office' || role === 'admin'
  const unread = notices.filter(n => !n.is_read).length

  const customerMap = new Map<string, { phone: string; name: string; jobs: Job[] }>()
  for (const job of jobs) {
    const current = customerMap.get(job.customer_phone)
    if (current) current.jobs.push(job)
    else customerMap.set(job.customer_phone, { phone: job.customer_phone, name: job.customer_name, jobs: [job] })
  }
  const customers = Array.from(customerMap.values())
    .filter(c => !customerSearch.trim() || `${c.name} ${c.phone}`.toLocaleLowerCase('tr-TR').includes(customerSearch.toLocaleLowerCase('tr-TR')))
    .sort((a,b) => a.name.localeCompare(b.name, 'tr'))

  const reportJobs = jobs.filter(j => inReportRange(j.scheduled_at))
  const reportHistory = jobHistory.filter(h => inReportRange(h.created_at))

  const creatorReportMap = new Map<string, { name: string; total: number; completed: number; postponed: number; pending: number }>()
  for (const job of reportJobs) {
    const name = job.creator?.full_name || job.created_by_name || 'Bilinmeyen Personel'
    const current = creatorReportMap.get(name) || { name, total: 0, completed: 0, postponed: 0, pending: 0 }
    current.total += 1
    if (job.status === 'completed') current.completed += 1
    else if (job.status === 'postponed') current.postponed += 1
    else current.pending += 1
    creatorReportMap.set(name, current)
  }
  const reportCreatorReports = Array.from(creatorReportMap.values()).sort((a,b) => b.total - a.total)

  const serviceReportMap = new Map<string, { name: string; completed: number; postponed: number }>()
  for (const h of reportHistory) {
    if (h.changer?.role !== 'service') continue
    if (h.new_status !== 'completed' && h.new_status !== 'postponed') continue
    const name = h.changer?.full_name || 'Servis Personeli'
    const current = serviceReportMap.get(name) || { name, completed: 0, postponed: 0 }
    if (h.new_status === 'completed') current.completed += 1
    if (h.new_status === 'postponed') current.postponed += 1
    serviceReportMap.set(name, current)
  }
  const serviceReports = Array.from(serviceReportMap.values()).sort((a,b) => (b.completed + b.postponed) - (a.completed + a.postponed))

  const viewTitle =
    view === 'personnel' ? 'Personel Yönetimi' :
    view === 'customers' ? 'Müşteri Geçmişi' :
    view === 'reports' ? 'Raporlar' : 'İş Programı'
  const viewSubtitle =
    view === 'personnel' ? 'Ofis ve servis kullanıcılarını yönetin' :
    view === 'customers' ? 'Müşterilerin geçmiş iş kayıtlarını görüntüleyin' :
    view === 'reports' ? 'Tarih aralığı, servis performansı ve dışa aktarma' :
    new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(new Date())

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><img className="brandLogo" src="/sutek-logo.png" alt="SUTEK"/><div><b>SUTEK</b><small>İş Takip Sistemi</small></div></div>
      <nav>
        <button className={view === 'jobs' && filter === 'bugun' ? 'active' : ''} onClick={() => { setView('jobs'); setFilter('bugun') }}>Bugünün İşleri</button>
        <button className={view === 'jobs' && filter === 'bekleyen' ? 'active' : ''} onClick={() => { setView('jobs'); setFilter('bekleyen') }}>Bekleyen İşler</button>
        <button className={view === 'jobs' && filter === 'tamamlanan' ? 'active' : ''} onClick={() => { setView('jobs'); setFilter('tamamlanan') }}>Tamamlananlar</button>
        <button className={view === 'customers' ? 'active' : ''} onClick={() => setView('customers')}>Müşteri Geçmişi</button>
        {canSeeReports && <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>Raporlar</button>}
        {role === 'admin' && <button className={view === 'personnel' ? 'active' : ''} onClick={() => setView('personnel')}>Personel Yönetimi</button>}
      </nav>
      <div className="sidebarBottom"><span>{profileName}</span><small>{roleText[role]}</small><button className="signOut" onClick={signOut}>Çıkış yap</button></div>
    </aside>

    <section className="content">
      <header className="topbar">
        <div><h1>{viewTitle}</h1><p>{viewSubtitle}</p></div>
        <div className="topActions">
          <button className="noticeBtn" onClick={() => setShowNotices(v => !v)}>🔔 <b>{unread}</b></button>
          {view === 'jobs' && canCreate && <button className="primary" onClick={() => setShowForm(true)}>+ Yeni İş</button>}
          {view === 'personnel' && role === 'admin' && <button className="primary" onClick={() => setShowPersonnelForm(true)}>+ Personel Ekle</button>}
        </div>
      </header>

      {showNotices && <div className="noticePanel">
        <div className="noticeHead"><h3>Bildirimler</h3><button onClick={markAllRead}>Tümünü okundu yap</button></div>
        {notices.length === 0 ? <p className="muted">Henüz bildirim yok.</p> : notices.map(n => <article key={n.id} className={n.is_read ? 'read' : ''}><b>{n.title || 'Bildirim'}</b><span>{n.message}</span><small>{new Date(n.created_at).toLocaleString('tr-TR')}</small></article>)}
      </div>}

      {view === 'jobs' ? <>
        <div className="stats">
          <article><span>Bugünkü iş</span><strong>{jobs.filter(j => new Date(j.scheduled_at).toDateString() === today).length}</strong></article>
          <article><span>Bekleyen</span><strong>{jobs.filter(j => j.status === 'pending' || j.status === 'in_progress').length}</strong></article>
          <article><span>Tamamlanan</span><strong>{jobs.filter(j => j.status === 'completed').length}</strong></article>
          <article><span>Ertelenen</span><strong>{jobs.filter(j => j.status === 'postponed').length}</strong></article>
        </div>

        <div className="panel">
          <div className="panelHead jobPanelHead">
            <div><h2>{filter === 'bugun' ? 'Bugünün İşleri' : filter === 'bekleyen' ? 'Bekleyen İşler' : 'Tamamlanan İşler'}</h2><input className="searchInput" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Müşteri, telefon, servis veya iş ara…" /></div>
            <div className="quickFilters"><button className={jobQuickFilter==='all'?'selected':''} onClick={()=>setJobQuickFilter('all')}>Tümü</button><button className={jobQuickFilter==='urgent'?'selected':''} onClick={()=>setJobQuickFilter('urgent')}>Acil</button><button className={jobQuickFilter==='late'?'selected':''} onClick={()=>setJobQuickFilter('late')}>Geciken</button><button className={jobQuickFilter==='upcoming'?'selected':''} onClick={()=>setJobQuickFilter('upcoming')}>Yaklaşan</button><span>{searched.length} kayıt</span></div>
          </div>
          {loading ? <div className="empty">Yükleniyor…</div> : searched.length === 0 ? <div className="empty">Bu bölümde iş bulunmuyor.</div> :
            <div className="jobList">{searched.map(job => {
              const late = job.status !== 'completed' && new Date(job.scheduled_at).getTime() < Date.now()
              const diff = new Date(job.scheduled_at).getTime() - Date.now()
              const upcoming = job.status !== 'completed' && diff >= 0 && diff <= 2 * 60 * 60 * 1000
              return <article className={`job ${job.priority === 'urgent' ? 'urgentJob' : ''} ${late ? 'lateJob' : upcoming ? 'upcomingJob' : ''}`} key={job.id}>
              <div className="time"><strong>{new Date(job.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</strong><small>{new Date(job.scheduled_at).toLocaleDateString('tr-TR')}</small></div>
              <div className="jobInfo">
                <div className="jobTitle"><h3>{job.customer_name}</h3><span className={`badge ${job.status}`}>{statusText[job.status]}</span>{job.priority === 'urgent' && <span className="priorityBadge">ACİL</span>}{late && <span className="lateBadge">GECİKTİ</span>}{!late && upcoming && <span className="upcomingBadge">YAKLAŞIYOR</span>}</div>
                <a href={`tel:${job.customer_phone}`}>{job.customer_phone}</a><p>{job.description}</p>
                <div className="jobMeta"><small>Ekleyen: <b>{job.creator?.full_name || job.created_by_name || 'SUTEK Personeli'}</b></small><small>Servis: <b>{job.assignee?.full_name || 'Atanmadı'}</b></small></div>
              </div>
              <div className="actions">
                {canSchedule && <button onClick={() => setEditJob(job)}>Düzenle</button>}
                <button onClick={() => setHistoryPhone(job.customer_phone)}>Geçmiş</button>
                <button onClick={() => setFilesJob(job)}>Dosyalar ({attachments.filter(a => a.job_id === job.id).length})</button>
                <button onClick={() => uploadJobFile(job)} disabled={fileBusy}>+ Dosya</button>
                <button onClick={() => openReport(job)}>{job.customer_report ? 'Raporu Aç' : 'Rapor Yaz'}</button>
                {job.customer_report && <button className="whatsappBtn" onClick={() => whatsappCustomerReport(job)}>WhatsApp</button>}
                {canOperate && job.status !== 'completed' && <>
                  {job.status !== 'in_progress' && <button onClick={() => setStatus(job, 'in_progress')}>İşleme Al</button>}
                  <button className="success" onClick={() => setStatus(job, 'completed')}>✓ Tamamlandı</button>
                  {job.status !== 'postponed' && <button className="warning" onClick={() => setStatus(job, 'postponed')}>↻ Ertele</button>}
                </>}
                {canSchedule && job.status === 'postponed' && <button className="primary" onClick={() => rescheduleJob(job)}>📅 Tarih Belirle</button>}
                {canSchedule && <button className="dangerBtn" onClick={() => deleteJob(job)}>Sil</button>}
                {role === 'office' && job.status !== 'postponed' && job.status !== 'completed' && <span className="roleHint">Durumu servis günceller</span>}
              </div>
            </article>})}</div>}
        </div>
      </> : view === 'customers' ?
        <div className="panel">
          <div className="panelHead"><div><h2>Müşteriler</h2><input className="searchInput" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Müşteri adı veya telefon ara…" /></div><span>{customers.length} müşteri</span></div>
          {customers.length === 0 ? <div className="empty">Müşteri kaydı bulunamadı.</div> :
            <div className="customerList">{customers.map(customer => {
              const completed = customer.jobs.filter(j => j.status === 'completed').length
              const postponed = customer.jobs.filter(j => j.status === 'postponed').length
              const lastJob = [...customer.jobs].sort((a,b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at))[0]
              return <article className="customerRow" key={customer.phone}>
                <div><h3>{customer.name}</h3><a href={`tel:${customer.phone}`}>{customer.phone}</a><small>Son iş: {new Date(lastJob.scheduled_at).toLocaleString('tr-TR')}</small></div>
                <div className="customerStats"><span><b>{customer.jobs.length}</b> Toplam</span><span><b>{completed}</b> Tamamlandı</span><span><b>{postponed}</b> Ertelendi</span></div>
                <button onClick={() => setHistoryPhone(customer.phone)}>Geçmişi Aç</button>
              </article>
            })}</div>}
        </div>
      : view === 'reports' && canSeeReports ?
        <>
          <div className="reportToolbar">
            <div className="dateFilters">
              <label>Başlangıç<input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} /></label>
              <label>Bitiş<input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} /></label>
              {(reportStart || reportEnd) && <button onClick={() => { setReportStart(''); setReportEnd('') }}>Filtreyi Temizle</button>}
            </div>
            <div className="exportButtons">
              <button onClick={downloadExcelReport}>Excel İndir</button>
              <button className="primary" onClick={printPdfReport}>PDF Oluştur</button>
            </div>
          </div>
          <div className="reportRangeLabel">{reportRangeText()}</div>
          <div className="stats">
            <article><span>Toplam iş</span><strong>{reportJobs.length}</strong></article>
            <article><span>Bekleyen / İşlemde</span><strong>{reportJobs.filter(j => j.status === 'pending' || j.status === 'in_progress').length}</strong></article>
            <article><span>Tamamlanan</span><strong>{reportJobs.filter(j => j.status === 'completed').length}</strong></article>
            <article><span>Ertelenen</span><strong>{reportJobs.filter(j => j.status === 'postponed').length}</strong></article>
          </div>
          <div className="panel">
            <div className="panelHead"><div><h2>İşi Ekleyen Personel Bazında</h2><p className="muted reportIntro">İşi sisteme ekleyen kullanıcıya göre hesaplanır.</p></div><span>{reportCreatorReports.length} personel</span></div>
            {reportCreatorReports.length === 0 ? <div className="empty">Raporlanacak iş bulunmuyor.</div> :
              <div className="reportTable">
                <div className="reportRow reportHead"><span>Personel</span><span>Toplam</span><span>Tamamlanan</span><span>Ertelenen</span><span>Bekleyen</span></div>
                {reportCreatorReports.map(r => <div className="reportRow" key={r.name}><b>{r.name}</b><span>{r.total}</span><span>{r.completed}</span><span>{r.postponed}</span><span>{r.pending}</span></div>)}
              </div>}
          </div>
          <div className="panel serviceReportPanel">
            <div className="panelHead"><div><h2>Servis Personeli Performansı</h2><p className="muted reportIntro">Servis kullanıcısının yaptığı gerçek durum değişikliklerinden hesaplanır.</p></div><span>{serviceReports.length} servis</span></div>
            {serviceReports.length === 0 ? <div className="empty">Bu tarih aralığında servis işlemi bulunmuyor.</div> :
              <div className="reportTable">
                <div className="serviceReportRow reportHead"><span>Servis Personeli</span><span>Tamamladı</span><span>Erteledi</span><span>Toplam İşlem</span></div>
                {serviceReports.map(r => <div className="serviceReportRow" key={r.name}><b>{r.name}</b><span>{r.completed}</span><span>{r.postponed}</span><span>{r.completed + r.postponed}</span></div>)}
              </div>}
          </div>
        </>
      :
        <div className="panel personnelPanel">
          <div className="panelHead"><div><h2>SUTEK Personeli</h2><p className="muted personnelIntro">Kullanıcı rollerini ve hesap durumlarını buradan yönetin.</p></div><span>{profiles.length} personel</span></div>
          {personnelMessage && <div className="personnelMessage">{personnelMessage}</div>}
          <div className="personnelList">{profiles.map(person => <article className="personRow" key={person.id}>
            <div className="personMain"><div className="avatar">{person.full_name?.slice(0,1).toLocaleUpperCase('tr-TR') || 'S'}</div><div><h3>{person.full_name}</h3><p>{person.email || 'E-posta bilgisi yok'}</p></div></div>
            <div className="personControls">
              <label>Rol<select value={person.role} disabled={personnelBusy} onChange={e => updatePersonnel(person, { role: e.target.value as Role })}><option value="admin">Yönetici</option><option value="office">Ofis</option><option value="service">Servis</option></select></label>
              <label className="activeToggle"><input type="checkbox" checked={person.is_active} disabled={personnelBusy} onChange={e => updatePersonnel(person, { is_active: e.target.checked })}/><span>{person.is_active ? 'Aktif' : 'Pasif'}</span></label>
              <button className="warning" disabled={personnelBusy} onClick={() => deletePersonnel(person)}>Sil</button>
            </div>
          </article>)}</div>
        </div>}
    </section>

    {editJob && canSchedule && <div className="modalBackdrop" onMouseDown={() => setEditJob(null)}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHead"><div><h2>İşi Düzenle</h2><p>{editJob.customer_name}</p></div><button onClick={() => setEditJob(null)}>×</button></div>
        <form onSubmit={saveJobEdit}>
          <div className="grid2"><label>Tarih<input name="date" type="date" required defaultValue={localDateForJob(editJob.scheduled_at)} /></label><label>Saat<input name="time" type="time" required defaultValue={localTimeForJob(editJob.scheduled_at)} /></label></div>
          <label>Müşteri Adı<input name="customer_name" required defaultValue={editJob.customer_name} /></label>
          <label>Telefon<input name="customer_phone" required inputMode="tel" defaultValue={editJob.customer_phone} /></label>
          <label>Yapılacak İş<textarea name="description" required rows={4} defaultValue={editJob.description} /></label>
          <div className="grid2">
            <label>Öncelik<select name="priority" defaultValue={editJob.priority || 'normal'}><option value="normal">Normal</option><option value="urgent">Acil</option></select></label>
            <label>Servis Personeli<select name="assigned_to" defaultValue={editJob.assigned_to || ''}><option value="">Atama yok</option>{serviceProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
          </div>
          <div className="formActions"><button type="button" onClick={() => setEditJob(null)}>Vazgeç</button><button className="primary" type="submit">Değişiklikleri Kaydet</button></div>
        </form>
      </div>
    </div>}

    {filesJob && <div className="modalBackdrop" onMouseDown={() => setFilesJob(null)}>
      <div className="modal historyModal" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHead"><div><h2>İş Dosyaları</h2><p>{filesJob.customer_name}</p></div><button onClick={() => setFilesJob(null)}>×</button></div>
        <div className="fileModalActions"><button className="primary" onClick={() => uploadJobFile(filesJob)} disabled={fileBusy}>{fileBusy ? 'Yükleniyor…' : '+ Fotoğraf / Dosya Ekle'}</button></div>
        <div className="attachmentList">
          {attachments.filter(a => a.job_id === filesJob.id).length === 0 ? <div className="empty compactEmpty">Henüz dosya eklenmemiş.</div> :
            attachments.filter(a => a.job_id === filesJob.id).map(file => <article key={file.id}>
              <div className="attachmentIcon">{file.mime_type?.startsWith('image/') ? '🖼️' : '📎'}</div>
              <div className="attachmentInfo"><b>{file.file_name}</b><small>{file.file_size ? `${(file.file_size/1024/1024).toFixed(2)} MB` : ''} · {new Date(file.created_at).toLocaleString('tr-TR')}</small></div>
              <div className="attachmentActions"><button onClick={() => openAttachment(file)}>Aç</button><button className="dangerBtn" onClick={() => deleteAttachment(file)}>Sil</button></div>
            </article>)}
        </div>
      </div>
    </div>}

    {reportJob && <div className="modalBackdrop" onMouseDown={() => setReportJob(null)}>
      <div className="modal reportModal" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHead"><div><h2>Müşteri Raporu</h2><p>{reportJob.customer_name} · {reportJob.customer_phone}</p></div><button onClick={() => setReportJob(null)}>×</button></div>
        <label className="reportLabel">Müşteriye gönderilecek rapor
          <textarea rows={9} value={reportDraft} onChange={e => setReportDraft(e.target.value)} readOnly={!['service','admin'].includes(role)} placeholder="Servis yapılan işlemi ve sonucu müşterinin anlayacağı şekilde yazsın…" />
        </label>
        <div className="reportHelp">WhatsApp üzerinden yalnızca bu alana yazılan rapor paylaşılır.</div>
        <div className="formActions">
          {reportJob.customer_report && <button type="button" className="whatsappBtn" onClick={() => whatsappCustomerReport({ ...reportJob, customer_report: reportDraft || reportJob.customer_report })}>WhatsApp'ta Paylaş</button>}
          <button type="button" onClick={() => setReportJob(null)}>Kapat</button>
          {['service','admin'].includes(role) && <button className="primary" type="button" disabled={reportBusy} onClick={saveCustomerReport}>{reportBusy ? 'Kaydediliyor…' : 'Raporu Kaydet'}</button>}
        </div>
      </div>
    </div>}

    {historyPhone && <div className="modalBackdrop" onMouseDown={() => setHistoryPhone(null)}><div className="modal historyModal" onMouseDown={e => e.stopPropagation()}><div className="modalHead"><div><h2>Müşteri Geçmişi</h2><p>{historyPhone} · {historyJobs.length} kayıt</p></div><button onClick={() => setHistoryPhone(null)}>×</button></div><div className="historyList">{historyJobs.map(h => <article key={h.id}><div><b>{new Date(h.scheduled_at).toLocaleString('tr-TR')}</b><span className={`badge ${h.status}`}>{statusText[h.status]}</span></div><h3>{h.customer_name}</h3><p>{h.description}</p></article>)}</div></div></div>}

    {showPersonnelForm && role === 'admin' && <div className="modalBackdrop" onMouseDown={() => setShowPersonnelForm(false)}><div className="modal" onMouseDown={e => e.stopPropagation()}><div className="modalHead"><div><h2>Yeni Personel Ekle</h2><p>Kullanıcı hemen giriş yapabilir.</p></div><button onClick={() => setShowPersonnelForm(false)}>×</button></div><form onSubmit={createPersonnel}><label>Ad Soyad<input name="full_name" required /></label><label>E-posta<input name="email" type="email" required /></label><label>Geçici Şifre<input name="password" type="password" minLength={6} required /></label><label>Rol<select name="role" defaultValue="office"><option value="office">Ofis</option><option value="service">Servis</option><option value="admin">Yönetici</option></select></label>{personnelMessage && <div className="authMessage">{personnelMessage}</div>}<div className="formActions"><button type="button" onClick={() => setShowPersonnelForm(false)}>Vazgeç</button><button className="primary" type="submit" disabled={personnelBusy}>{personnelBusy ? 'Oluşturuluyor…' : 'Personeli Oluştur'}</button></div></form></div></div>}

    {showForm && <div className="modalBackdrop" onMouseDown={() => setShowForm(false)}><div className="modal" onMouseDown={e => e.stopPropagation()}><div className="modalHead"><div><h2>Yeni İş Ekle</h2><p>İş servis bölümüne iletilecek.</p></div><button onClick={() => setShowForm(false)}>×</button></div><form onSubmit={createJob}><div className="grid2"><label>Tarih<input name="date" type="date" required defaultValue={localDateInputValue()} /></label><label>Saat<input name="time" type="time" required /></label></div><label>Müşteri Adı<input name="customer_name" required /></label><label>Telefon<input name="customer_phone" required inputMode="tel" /></label><label>Yapılacak İş<textarea name="description" required rows={4} /></label><div className="grid2"><label>Öncelik<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="urgent">Acil</option></select></label><label>Servis Personeli<select name="assigned_to" defaultValue=""><option value="">Atama yok</option>{serviceProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label></div><div className="creator">Ekleyen kişi otomatik kaydedilecek: <b>{profileName}</b></div><div className="formActions"><button type="button" onClick={() => setShowForm(false)}>Vazgeç</button><button className="primary" type="submit">İşi Oluştur</button></div></form></div></div>}
  </main>
}
