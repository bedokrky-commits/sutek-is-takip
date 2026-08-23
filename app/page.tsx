// @ts-nocheck
'use client'

import { FormEvent, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createClient } from '../lib/supabase/client'
import './v06-additions.css'

type Status = 'pending' | 'in_progress' | 'completed' | 'postponed'
type Role = 'admin' | 'office' | 'service'
type Job = {
  id: string
  scheduled_at: string
  customer_name: string
  customer_phone: string
  customer_address?: string | null
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
  service_no?: string | null
  repeat_months?: number | null
  next_maintenance_at?: string | null
  signature_path?: string | null
  signature_name?: string | null
  signed_at?: string | null
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
type JobComment = {
  id: string
  job_id: string
  author_id: string
  message: string
  created_at: string
  author?: { full_name?: string; role?: Role } | null
}
type ServiceReport = {
  id: string
  job_id: string
  work_performed: string
  parts_used?: string | null
  internal_note?: string | null
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
}
type ServiceLiveStatus = {
  user_id: string
  status: 'available' | 'en_route' | 'on_site'
  job_id?: string | null
  updated_at: string
}
type ServiceTimeLog = {
  id: string
  job_id: string
  user_id: string
  en_route_at?: string | null
  on_site_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

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
  const [serviceReports, setServiceReports] = useState<ServiceReport[]>([])
  const [serviceLiveStatuses, setServiceLiveStatuses] = useState<ServiceLiveStatus[]>([])
  const [serviceTimeLogs, setServiceTimeLogs] = useState<ServiceTimeLog[]>([])
  const [clockTick, setClockTick] = useState(Date.now())
  const [jobComments, setJobComments] = useState<JobComment[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [filesJob, setFilesJob] = useState<Job | null>(null)
  const [reportJob, setReportJob] = useState<Job | null>(null)
  const [reportDraft, setReportDraft] = useState('')
  const [workPerformedDraft, setWorkPerformedDraft] = useState('')
  const [partsUsedDraft, setPartsUsedDraft] = useState('')
  const [internalNoteDraft, setInternalNoteDraft] = useState('')
  const [completeAfterReport, setCompleteAfterReport] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [serviceProfiles, setServiceProfiles] = useState<Profile[]>([])
  const [editJob, setEditJob] = useState<Job | null>(null)
  const [jobQuickFilter, setJobQuickFilter] = useState<'all' | 'urgent' | 'late' | 'upcoming'>('all')
  const [navigationJob, setNavigationJob] = useState<Job | null>(null)
  const [commentsJob, setCommentsJob] = useState<Job | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [signatureJob, setSignatureJob] = useState<Job | null>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const signatureDrawingRef = useRef(false)
  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>('month')
  const [calendarAnchor, setCalendarAnchor] = useState(localDateInputValue())
  const [signedIn, setSignedIn] = useState(!configured)
  const [currentUserId, setCurrentUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [profileName, setProfileName] = useState('SUTEK Kullanıcısı')
  const [role, setRole] = useState<Role>('office')
  const [filter, setFilter] = useState<'bugun' | 'bekleyen' | 'tamamlanan'>('bugun')
  const [view, setView] = useState<'jobs' | 'calendar' | 'maintenance' | 'dashboard' | 'personnel' | 'customers' | 'reports'>('jobs')
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
  const [historyPage, setHistoryPage] = useState(1)
  const [jobCreateBusy, setJobCreateBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [isOnline, setIsOnline] = useState(true)

  function showMessage(message: string, type: 'success' | 'error' | 'info' = 'info') {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), type === 'error' ? 5200 : 3200)
  }

  function friendlyError(error: unknown, fallback = 'İşlem tamamlanamadı.') {
    const raw = error instanceof Error ? error.message : String(error || '')
    if (!raw) return fallback
    if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'
    if (raw.includes('JWT') || raw.includes('session') || raw.includes('Oturum')) return 'Oturumunuz yenilenemedi. Lütfen çıkış yapıp tekrar giriş yapın.'
    if (raw.includes('permission') || raw.includes('policy') || raw.includes('403')) return 'Bu işlem için yetkiniz bulunmuyor.'
    return raw
  }

  async function load() {
    if (!supabase) { setLoading(false); return }
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    setSignedIn(Boolean(user))
    setCurrentUserId(user?.id || '')
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

    const [{ data: js }, { data: ns }, { data: hs }, { data: sr }, { data: sls }, { data: stl }, { data: cm }, { data: at }] = await Promise.all([
      supabase.from('jobs').select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)').order('scheduled_at', { ascending: true }),
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('job_status_history').select('id,job_id,new_status,created_at,changed_by,changer:profiles!job_status_history_changed_by_fkey(full_name,role)').order('created_at', { ascending: true }),
      supabase.from('service_reports').select('id,job_id,work_performed,parts_used,internal_note,created_by,updated_by,created_at,updated_at').order('updated_at', { ascending: false }),
      supabase.from('service_live_status').select('user_id,status,job_id,updated_at'),
      supabase.from('service_time_logs').select('id,job_id,user_id,en_route_at,on_site_at,completed_at,created_at,updated_at').order('created_at', { ascending: false }),
      supabase.from('job_comments').select('id,job_id,author_id,message,created_at,author:profiles!job_comments_author_id_fkey(full_name,role)').order('created_at', { ascending: true }),
      supabase.from('job_attachments').select('id,job_id,file_name,storage_path,mime_type,file_size,created_at').order('created_at', { ascending: false })
    ])
    setJobs((js ?? []) as Job[])
    setNotices((ns ?? []) as Notice[])
    setJobHistory((hs ?? []) as JobHistory[])
    setServiceReports((sr ?? []) as ServiceReport[])
    setServiceLiveStatuses((sls ?? []) as ServiceLiveStatus[])
    setServiceTimeLogs((stl ?? []) as ServiceTimeLog[])
    setJobComments((cm ?? []) as JobComment[])
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
      if (view === 'personnel' || view === 'reports' || view === 'dashboard' || view === 'maintenance') setView('jobs')
    }
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    load()
    if (!supabase) return
    const { data: listener } = supabase.auth.onAuthStateChange(() => load())
    return () => listener.subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (!supabase || !signedIn) return

    async function refreshSingleJob(jobId: string) {
      const { data } = await supabase!
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_reports' }, payload => {
        const report = payload.new as ServiceReport
        setServiceReports(current => current.some(r => r.id === report.id) ? current : [report, ...current])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_reports' }, payload => {
        const report = payload.new as ServiceReport
        setServiceReports(current => current.some(r => r.id === report.id) ? current.map(r => r.id === report.id ? report : r) : [report, ...current])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'service_reports' }, payload => {
        const id = String((payload.old as { id?: string })?.id || '')
        if (id) setServiceReports(current => current.filter(r => r.id !== id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_live_status' }, payload => {
        const live = payload.new as ServiceLiveStatus
        setServiceLiveStatuses(current => current.some(s => s.user_id === live.user_id)
          ? current.map(s => s.user_id === live.user_id ? live : s)
          : [...current, live])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_live_status' }, payload => {
        const live = payload.new as ServiceLiveStatus
        setServiceLiveStatuses(current => current.some(s => s.user_id === live.user_id)
          ? current.map(s => s.user_id === live.user_id ? live : s)
          : [...current, live])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'service_live_status' }, payload => {
        const userId = String((payload.old as { user_id?: string })?.user_id || '')
        if (userId) setServiceLiveStatuses(current => current.filter(s => s.user_id !== userId))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_time_logs' }, payload => {
        const log = payload.new as ServiceTimeLog
        setServiceTimeLogs(current => current.some(x => x.id === log.id) ? current.map(x => x.id === log.id ? log : x) : [log, ...current])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_time_logs' }, payload => {
        const log = payload.new as ServiceTimeLog
        setServiceTimeLogs(current => current.some(x => x.id === log.id) ? current.map(x => x.id === log.id ? log : x) : [log, ...current])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'service_time_logs' }, payload => {
        const id = String((payload.old as { id?: string })?.id || '')
        if (id) setServiceTimeLogs(current => current.filter(x => x.id !== id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_comments' }, payload => {
        const raw = payload.new as JobComment
        void supabase!.from('job_comments').select('id,job_id,author_id,message,created_at,author:profiles!job_comments_author_id_fkey(full_name,role)').eq('id', raw.id).single().then(({ data }) => {
          if (data) setJobComments(current => current.some(c => c.id === data.id) ? current : [...current, data as JobComment])
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'job_comments' }, payload => {
        const id = String((payload.old as { id?: string })?.id || '')
        if (id) setJobComments(current => current.filter(c => c.id !== id))
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

  useEffect(() => {
    if (!supabase || !signedIn) return

    const checkAlerts = async () => {
      if (document.visibilityState !== 'visible') return
      await supabase.rpc('generate_job_alerts')
    }

    void checkAlerts()
    const timer = window.setInterval(() => { void checkAlerts() }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkAlerts()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [supabase, signedIn])

  useEffect(() => {
    const updateConnection = () => {
      const online = navigator.onLine
      setIsOnline(online)
      if (online) showMessage('Bağlantı yeniden kuruldu.', 'success')
    }
    setIsOnline(navigator.onLine)
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    return () => {
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
    }
  }, [])

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
    if (!supabase || jobCreateBusy) return
    setJobCreateBusy(true)
    const form = e.currentTarget
    const fd = new FormData(form)
    const scheduled = new Date(`${fd.get('date')}T${fd.get('time')}`)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      setJobCreateBusy(false)
      return showMessage('Oturum bulunamadı. Lütfen tekrar giriş yapın.', 'error')
    }
    const { data, error } = await supabase.from('jobs').insert({
      scheduled_at: scheduled.toISOString(),
      customer_name: String(fd.get('customer_name')).trim(),
      customer_phone: String(fd.get('customer_phone')).trim(),
      customer_address: String(fd.get('customer_address') || '').trim() || null,
      description: String(fd.get('description')).trim(),
      priority: String(fd.get('priority') || 'normal') === 'urgent' ? 'urgent' : 'normal',
      assigned_to: String(fd.get('assigned_to') || '') || null,
      repeat_months: Number(fd.get('repeat_months') || 0) || null,
      created_by: auth.user.id
    }).select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)').single()
    if (error) { setJobCreateBusy(false); return showMessage(friendlyError(error.message), 'error') }

    if (data) {
      const newJob = data as Job
      setJobs(current => {
        if (current.some(j => j.id === newJob.id)) return current
        return [...current, newJob].sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
      })
    }
    setShowForm(false)
    form.reset()
    setJobCreateBusy(false)
    showMessage('İş programa eklendi.', 'success')
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
      return showMessage(friendlyError(error.message), 'error')
    }
    if (data) setJobs(current => current.map(j => j.id === job.id ? data as Job : j))
  }

  async function rescheduleJob(job: Job) {
    if (!supabase || !['office', 'admin'].includes(role)) return
    const date = prompt('Yeni tarih ve saat (YYYY-MM-DD HH:MM)')
    if (!date) return
    const parsed = new Date(date.replace(' ', 'T'))
    if (Number.isNaN(parsed.getTime())) return showMessage(friendlyError('Geçerli tarih-saat girin.'), 'error')
    const { data, error } = await supabase.functions.invoke('office-reschedule-job', {
      body: { job_id: job.id, scheduled_at: parsed.toISOString() }
    })
    if (error || data?.error) return showMessage(friendlyError(data?.error || error?.message || 'Tarih güncellenemedi.'), 'error')
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
        customer_address: String(fd.get('customer_address') || '').trim(),
        description: String(fd.get('description')).trim(),
        scheduled_at: scheduled.toISOString(),
        priority: String(fd.get('priority') || 'normal'),
        assigned_to: String(fd.get('assigned_to') || '') || null,
        repeat_months: Number(fd.get('repeat_months') || 0) || null
      }
    })
    if (error || data?.error) return showMessage(friendlyError(data?.error || error?.message || 'İş düzenlenemedi.'), 'error')
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
      if (file.size > 10 * 1024 * 1024) return showMessage(friendlyError('Dosya en fazla 10 MB olabilir.'), 'error')
      setFileBusy(true)
      try {
        const { data: auth } = await supabase.auth.getUser()
        if (!auth.user) return showMessage(friendlyError('Oturum bulunamadı.'), 'error')
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${auth.user.id}/${job.id}/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage.from('job-files').upload(path, file, { upsert: false })
        if (uploadError) return showMessage(friendlyError('Dosya yüklenemedi: ' + uploadError.message), 'error')
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
          return showMessage(friendlyError('Dosya kaydı oluşturulamadı: ' + rowError.message), 'error')
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
    if (error || !data?.signedUrl) return showMessage(friendlyError('Dosya açılamadı.'), 'error')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function deleteAttachment(file: Attachment) {
    if (!supabase) return
    if (!confirm(`${file.file_name} dosyasını silmek istediğinize emin misiniz?`)) return
    const { error: storageError } = await supabase.storage.from('job-files').remove([file.storage_path])
    if (storageError) return showMessage(friendlyError('Dosya silinemedi: ' + storageError.message), 'error')
    const { error } = await supabase.from('job_attachments').delete().eq('id', file.id)
    if (error) return showMessage(friendlyError('Dosya kaydı silinemedi: ' + error.message), 'error')
    setAttachments(current => current.filter(a => a.id !== file.id))
  }

  function openReport(job: Job, completeAfter = false) {
    const serviceReport = serviceReports.find(r => r.job_id === job.id)
    setReportJob(job)
    setReportDraft(job.customer_report || '')
    setWorkPerformedDraft(serviceReport?.work_performed || '')
    setPartsUsedDraft(serviceReport?.parts_used || '')
    setInternalNoteDraft(serviceReport?.internal_note || '')
    setCompleteAfterReport(completeAfter)
  }

  async function saveServiceForm(completeAfter = false) {
    if (!supabase || !reportJob || !['service', 'admin'].includes(role)) return

    const workPerformed = workPerformedDraft.trim()
    const customerReport = reportDraft.trim()
    if (!workPerformed) return showMessage(friendlyError('Yapılan işlem alanı boş olamaz.'), 'error')
    if (!customerReport) return showMessage(friendlyError('Müşteriye gönderilecek rapor boş olamaz.'), 'error')

    setReportBusy(true)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setReportBusy(false); return }

    const existing = serviceReports.find(r => r.job_id === reportJob.id)
    const reportPayload = {
      job_id: reportJob.id,
      work_performed: workPerformed,
      parts_used: partsUsedDraft.trim() || null,
      internal_note: internalNoteDraft.trim() || null,
      updated_by: auth.user.id,
      ...(existing ? {} : { created_by: auth.user.id })
    }

    const { data: savedReport, error: reportError } = await supabase
      .from('service_reports')
      .upsert(reportPayload, { onConflict: 'job_id' })
      .select('id,job_id,work_performed,parts_used,internal_note,created_by,updated_by,created_at,updated_at')
      .single()

    if (reportError) {
      setReportBusy(false)
      return showMessage(friendlyError('Servis formu kaydedilemedi: ' + reportError.message), 'error')
    }

    const jobPatch: Record<string, string> = {
      customer_report: customerReport,
      report_updated_at: new Date().toISOString(),
      report_updated_by: auth.user.id
    }
    if (completeAfter) {
      jobPatch.status = 'completed'
      jobPatch.completed_at = new Date().toISOString()
    }

    const { data: updatedJob, error: jobError } = await supabase
      .from('jobs')
      .update(jobPatch)
      .eq('id', reportJob.id)
      .select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)')
      .single()

    setReportBusy(false)
    if (jobError) return showMessage(friendlyError('İş güncellenemedi: ' + jobError.message), 'error')

    if (savedReport) {
      const sr = savedReport as ServiceReport
      setServiceReports(current => current.some(r => r.id === sr.id)
        ? current.map(r => r.id === sr.id ? sr : r)
        : [sr, ...current])
    }
    if (updatedJob) {
      setJobs(current => current.map(j => j.id === reportJob.id ? updatedJob as Job : j))
    }
    setReportJob(null)
    setCompleteAfterReport(false)
  }

  function completeJob(job: Job) {
    const hasForm = serviceReports.some(r => r.job_id === job.id)
    if (!hasForm || !(job.customer_report || '').trim()) {
      openReport(job, true)
      return
    }
    void setStatus(job, 'completed')
  }

  function escapeServiceHtml(value?: string | null) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }

  async function printServiceForm(job: Job) {
    if (!supabase) return
    const serviceReport = serviceReports.find(r => r.job_id === job.id)
    if (!serviceReport) return showMessage(friendlyError('Bu iş için henüz servis formu oluşturulmamış.'), 'error')

    const popup = window.open('', '_blank', 'width=1000,height=850')
    if (!popup) return showMessage(friendlyError('PDF penceresi açılamadı. Tarayıcı açılır pencere iznini kontrol edin.'), 'error')

    popup.document.write('<html><body style="font-family:Arial,sans-serif;padding:30px">Servis formu hazırlanıyor…</body></html>')

    const imageFiles = attachments.filter(a => a.job_id === job.id && a.mime_type?.startsWith('image/'))
    const imageUrls = await Promise.all(imageFiles.map(async file => {
      const { data } = await supabase.storage.from('job-files').createSignedUrl(file.storage_path, 60 * 10)
      return data?.signedUrl ? { name: file.file_name, url: data.signedUrl } : null
    }))
    const validImages = imageUrls.filter((item): item is { name: string; url: string } => Boolean(item))
    const signatureUrl = job.signature_path ? (await supabase.storage.from('job-files').createSignedUrl(job.signature_path, 60 * 10)).data?.signedUrl : null

    const photosHtml = validImages.length
      ? `<section><h2>Servis Fotoğrafları</h2><div class="photos">${validImages.map(img => `<figure><img src="${img.url}" alt=""><figcaption>${escapeServiceHtml(img.name)}</figcaption></figure>`).join('')}</div></section>`
      : ''

    const logoUrl = `${window.location.origin}/sutek-logo.png`
    const formNo = job.service_no || job.id.slice(0, 8).toUpperCase()

    popup.document.open()
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>SUTEK Servis Formu ${formNo}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;padding:28px;background:#fff}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #172033;padding-bottom:18px}
      .header img{width:145px;height:auto}.headerText{text-align:right}.headerText h1{margin:0;font-size:23px}.headerText p{margin:6px 0 0;color:#5f6877;font-size:12px}
      .meta{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:20px 0}.meta div{border:1px solid #dde2e8;border-radius:8px;padding:10px}.meta span{display:block;color:#6b7280;font-size:10px;text-transform:uppercase;margin-bottom:4px}.meta b{font-size:13px}
      h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #e3e6ea;padding-bottom:7px}.box{border:1px solid #dde2e8;border-radius:8px;padding:12px;min-height:52px;font-size:12px;line-height:1.5}
      .photos{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.photos figure{margin:0;border:1px solid #dde2e8;border-radius:8px;overflow:hidden}.photos img{display:block;width:100%;max-height:300px;object-fit:contain;background:#f5f6f8}.photos figcaption{font-size:10px;color:#6b7280;padding:7px}
      .signaturePrint{display:flex;align-items:center;gap:18px;border:1px solid #dde2e8;border-radius:8px;padding:12px}.signaturePrint img{width:220px;max-height:100px;object-fit:contain}.signaturePrint span{font-size:10px;color:#6b7280}.footer{margin-top:28px;border-top:1px solid #dfe3e8;padding-top:12px;font-size:10px;color:#6b7280;display:flex;justify-content:space-between}
      .actions{margin:18px 0}.actions button{padding:10px 16px;border:1px solid #172033;background:#172033;color:#fff;border-radius:7px}
      @media print{body{padding:0}.actions{display:none}.photos img{max-height:240px}}
    </style></head><body>
      <div class="header"><img src="${logoUrl}" alt="SUTEK"><div class="headerText"><h1>DİJİTAL SERVİS FORMU</h1><p>Form No: ${formNo}<br>${new Date().toLocaleString('tr-TR')}</p></div></div>
      <div class="meta">
        <div><span>Müşteri</span><b>${escapeServiceHtml(job.customer_name)}</b></div>
        <div><span>Telefon</span><b>${escapeServiceHtml(job.customer_phone)}</b></div>
        <div><span>Adres</span><b>${escapeServiceHtml(job.customer_address || '-')}</b></div>
        <div><span>Servis Tarihi</span><b>${new Date(job.scheduled_at).toLocaleString('tr-TR')}</b></div>
        <div><span>Servis Personeli</span><b>${escapeServiceHtml(job.assignee?.full_name || 'Atanmadı')}</b></div>
        <div><span>İş Durumu</span><b>${escapeServiceHtml(statusText[job.status])}</b></div>
      </div>
      <h2>Talep / Yapılacak İş</h2><div class="box">${escapeServiceHtml(job.description)}</div>
      <h2>Yapılan İşlem</h2><div class="box">${escapeServiceHtml(serviceReport.work_performed)}</div>
      <h2>Kullanılan / Değiştirilen Parçalar</h2><div class="box">${escapeServiceHtml(serviceReport.parts_used || 'Parça kullanılmadı / belirtilmedi.')}</div>
      <h2>Müşteriye Sunulan Servis Raporu</h2><div class="box">${escapeServiceHtml(job.customer_report || '')}</div>
      ${photosHtml}
      ${signatureUrl ? `<h2>Müşteri Onayı / İmza</h2><div class="signaturePrint"><img src="${signatureUrl}" alt="İmza"><div><b>${escapeServiceHtml(job.signature_name || '')}</b><br><span>${job.signed_at ? new Date(job.signed_at).toLocaleString('tr-TR') : ''}</span></div></div>` : ''}
      <div class="footer"><span>SUTEK</span><span>Bu form elektronik ortamda oluşturulmuştur.</span></div>
      <div class="actions"><button onclick="window.print()">PDF / Yazdır</button></div>
      <script>setTimeout(()=>window.print(),700)</script>
    </body></html>`)
    popup.document.close()
  }

  function openNavigation(provider: 'google' | 'apple' | 'yandex', address?: string | null) {
    const value = (address || '').trim()
    if (!value) return showMessage(friendlyError('Bu iş için adres girilmemiş.'), 'error')
    const query = encodeURIComponent(value)
    const urls = {
      google: `https://www.google.com/maps/search/?api=1&query=${query}`,
      apple: `https://maps.apple.com/?q=${query}`,
      yandex: `https://yandex.com/maps/?text=${query}`
    }
    window.open(urls[provider], '_blank', 'noopener,noreferrer')
    setNavigationJob(null)
  }

  function whatsappCustomerReport(job: Job) {
    const report = (job.customer_report || '').trim()
    if (!report) return showMessage(friendlyError('Bu iş için henüz müşteri raporu yazılmamış.'), 'error')
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
    if (error || data?.error) return showMessage(friendlyError(data?.error || error?.message || 'İş silinemedi.'), 'error')
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
      ...servicePerformanceReports.map(r => [r.name, String(r.completed), String(r.postponed), String(r.completed + r.postponed)]),
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
    if (!popup) return showMessage(friendlyError('PDF penceresi açılamadı. Tarayıcı açılır pencere iznini kontrol edin.'), 'error')
    const creatorRows = reportCreatorReports.map(r => `<tr><td>${r.name}</td><td>${r.total}</td><td>${r.completed}</td><td>${r.postponed}</td><td>${r.pending}</td></tr>`).join('')
    const serviceRows = servicePerformanceReports.map(r => `<tr><td>${r.name}</td><td>${r.completed}</td><td>${r.postponed}</td><td>${r.completed + r.postponed}</td></tr>`).join('')
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

  async function setMyServiceLiveStatus(status: 'available' | 'en_route' | 'on_site', jobId?: string | null) {
    if (!supabase || role !== 'service') return
    const { data, error } = await supabase.rpc('set_my_service_status', {
      p_status: status,
      p_job_id: jobId || null
    })
    if (error) return showMessage(friendlyError('Servis durumu güncellenemedi: ' + error.message), 'error')
    const live = data as ServiceLiveStatus | null
    if (live?.user_id) {
      setServiceLiveStatuses(current => current.some(s => s.user_id === live.user_id)
        ? current.map(s => s.user_id === live.user_id ? live : s)
        : [...current, live])
    }
    if (status === 'en_route') showMessage('Durumunuz: Yola Çıktı', 'success')
    if (status === 'on_site') showMessage('Durumunuz: Serviste / İşlemde', 'success')
    if (status === 'available') showMessage('Durumunuz: Müsait', 'success')
  }

  async function addJobComment() {
    if (!supabase || !commentsJob || !commentDraft.trim()) return
    const message = commentDraft.trim()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data, error } = await supabase.from('job_comments').insert({
      job_id: commentsJob.id,
      author_id: auth.user.id,
      message
    }).select('id,job_id,author_id,message,created_at,author:profiles!job_comments_author_id_fkey(full_name,role)').single()
    if (error) return showMessage(friendlyError('Not eklenemedi: ' + error.message), 'error')
    if (data) setJobComments(current => current.some(c => c.id === data.id) ? current : [...current, data as JobComment])
    setCommentDraft('')
  }

  async function deleteJobComment(comment: JobComment) {
    if (!supabase) return
    if (!confirm('Bu notu silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('job_comments').delete().eq('id', comment.id)
    if (error) return showMessage(friendlyError('Not silinemedi: ' + error.message), 'error')
    setJobComments(current => current.filter(c => c.id !== comment.id))
  }

  function signaturePoint(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) }
  }

  function signatureStart(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current
    const point = signaturePoint(e)
    if (!canvas || !point) return
    signatureDrawingRef.current = true
    canvas.setPointerCapture(e.pointerId)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.beginPath(); ctx.moveTo(point.x, point.y)
  }

  function signatureMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!signatureDrawingRef.current) return
    const canvas = signatureCanvasRef.current
    const point = signaturePoint(e)
    if (!canvas || !point) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827'
    ctx.lineTo(point.x, point.y); ctx.stroke()
  }

  function signatureEnd() { signatureDrawingRef.current = false }

  function clearSignature() {
    const canvas = signatureCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  async function saveSignature() {
    if (!supabase || !signatureJob || !signatureCanvasRef.current) return
    const signer = prompt('İmza sahibinin adı soyadı')?.trim()
    if (!signer) return
    const canvas = signatureCanvasRef.current
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return showMessage(friendlyError('İmza oluşturulamadı.'), 'error')
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const path = `${auth.user.id}/${signatureJob.id}/signature-${Date.now()}.png`
    const { error: uploadError } = await supabase.storage.from('job-files').upload(path, blob, { contentType: 'image/png' })
    if (uploadError) return showMessage(friendlyError('İmza yüklenemedi: ' + uploadError.message), 'error')
    if (signatureJob.signature_path) await supabase.storage.from('job-files').remove([signatureJob.signature_path])
    const signedAt = new Date().toISOString()
    const { data, error } = await supabase.from('jobs').update({ signature_path: path, signature_name: signer, signed_at: signedAt }).eq('id', signatureJob.id)
      .select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)').single()
    if (error) return showMessage(friendlyError('İmza kaydedilemedi: ' + error.message), 'error')
    if (data) setJobs(current => current.map(j => j.id === signatureJob.id ? data as Job : j))
    setSignatureJob(null)
  }

  async function createMaintenanceJob(source: Job) {
    if (!supabase || !canSchedule || !source.next_maintenance_at) return
    if (!confirm(`${source.customer_name} için periyodik bakım işi oluşturulsun mu?`)) return
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data, error } = await supabase.from('jobs').insert({
      scheduled_at: source.next_maintenance_at,
      customer_name: source.customer_name,
      customer_phone: source.customer_phone,
      customer_address: source.customer_address || null,
      description: `Periyodik bakım: ${source.description}`,
      priority: 'normal',
      assigned_to: source.assigned_to || null,
      repeat_months: source.repeat_months || null,
      created_by: auth.user.id
    }).select('*, creator:profiles!jobs_created_by_fkey(full_name), assignee:profiles!jobs_assigned_to_fkey(full_name)').single()
    if (error) return showMessage(friendlyError('Bakım işi oluşturulamadı: ' + error.message), 'error')
    await supabase.from('jobs').update({ next_maintenance_at: null }).eq('id', source.id)
    if (data) setJobs(current => [...current.map(j => j.id === source.id ? { ...j, next_maintenance_at: null } : j), data as Job].sort((a,b)=>+new Date(a.scheduled_at)-+new Date(b.scheduled_at)))
    showMessage('Periyodik bakım işi oluşturuldu.', 'success')
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

  useEffect(() => {
    setHistoryPage(1)
  }, [historyPhone])

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
  const serviceOrderScore = (job: Job) => {
    const now = Date.now()
    const when = new Date(job.scheduled_at).getTime()
    const sameDay = new Date(job.scheduled_at).toDateString() === new Date().toDateString()
    const diff = when - now
    let score = 0
    if (job.assigned_to === currentUserId) score -= 1000
    else if (!job.assigned_to) score -= 200
    else score += 300
    if (job.priority === 'urgent' && job.status !== 'completed') score -= 500
    if (job.status !== 'completed' && when < now) score -= 400
    if (job.status !== 'completed' && sameDay) score -= 250
    if (job.status !== 'completed' && diff >= 0 && diff <= 2 * 60 * 60 * 1000) score -= 150
    return score + when / 1e10
  }
  const displayJobs = role === 'service'
    ? [...searched].sort((a, b) => serviceOrderScore(a) - serviceOrderScore(b))
    : searched

  const myAssignedOpen = jobs.filter(j => j.assigned_to === currentUserId && j.status !== 'completed')
  const myAssignedUrgent = myAssignedOpen.filter(j => j.priority === 'urgent').length
  const myAssignedLate = myAssignedOpen.filter(j => new Date(j.scheduled_at).getTime() < Date.now()).length
  const myAssignedToday = myAssignedOpen.filter(j => new Date(j.scheduled_at).toDateString() === new Date().toDateString()).length

  const durationMs = (start?: string | null, end?: string | null) => {
    if (!start) return 0
    const a = new Date(start).getTime()
    const b = end ? new Date(end).getTime() : clockTick
    return Math.max(0, b - a)
  }
  const formatDuration = (ms: number) => {
    const totalMinutes = Math.max(0, Math.round(ms / 60000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours <= 0) return `${minutes} dk`
    return `${hours} sa ${minutes} dk`
  }
  const formatClock = (value?: string | null) => value
    ? new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '-'
  const logTravelMs = (log: ServiceTimeLog) => durationMs(log.en_route_at, log.on_site_at || log.completed_at)
  const logServiceMs = (log: ServiceTimeLog) => log.on_site_at ? durationMs(log.on_site_at, log.completed_at) : 0
  const logTotalMs = (log: ServiceTimeLog) => durationMs(log.en_route_at || log.on_site_at, log.completed_at)
  const todayDateKey = new Date().toDateString()
  const isTodayLog = (log: ServiceTimeLog) => {
    const value = log.completed_at || log.on_site_at || log.en_route_at || log.created_at
    return new Date(value).toDateString() === todayDateKey
  }

  const serviceStatusRows = serviceProfiles.map(person => {
    const assigned = jobs.filter(j => j.assigned_to === person.id)
    const todayKey = new Date().toDateString()
    const live = serviceLiveStatuses.find(s => s.user_id === person.id)
    const liveJob = live?.job_id ? jobs.find(j => j.id === live.job_id) : null
    const todayLogs = serviceTimeLogs.filter(log => log.user_id === person.id && isTodayLog(log))
    return {
      id: person.id,
      name: person.full_name,
      pending: assigned.filter(j => j.status === 'pending').length,
      inProgress: assigned.filter(j => j.status === 'in_progress').length,
      completed: assigned.filter(j => j.status === 'completed').length,
      todayCompleted: assigned.filter(j => j.status === 'completed' && new Date(j.scheduled_at).toDateString() === todayKey).length,
      postponed: assigned.filter(j => j.status === 'postponed').length,
      liveStatus: live?.status || 'available' as 'available' | 'en_route' | 'on_site',
      liveJobId: live?.job_id || null,
      liveJobCustomer: liveJob?.customer_name || null,
      liveUpdatedAt: live?.updated_at || null,
      todayTravelMs: todayLogs.reduce((sum, log) => sum + logTravelMs(log), 0),
      todayServiceMs: todayLogs.reduce((sum, log) => sum + logServiceMs(log), 0),
      todayTotalMs: todayLogs.reduce((sum, log) => sum + logTotalMs(log), 0)
    }
  })

  const historyJobs = historyPhone ? jobs.filter(j => j.customer_phone === historyPhone).sort((a,b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)) : []
  const historyPageSize = 5
  const historyTotalPages = Math.max(1, Math.ceil(historyJobs.length / historyPageSize))
  const safeHistoryPage = Math.min(historyPage, historyTotalPages)
  const pagedHistoryJobs = historyJobs.slice((safeHistoryPage - 1) * historyPageSize, safeHistoryPage * historyPageSize)
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
  const servicePerformanceReports = Array.from(serviceReportMap.values()).sort((a,b) => (b.completed + b.postponed) - (a.completed + a.postponed))

  const reportTimeLogs = serviceTimeLogs.filter(log => {
    const value = log.completed_at || log.on_site_at || log.en_route_at || log.created_at
    return inReportRange(value)
  })
  const serviceTimeReports = serviceProfiles.map(person => {
    const logs = reportTimeLogs.filter(log => log.user_id === person.id)
    const completedLogs = logs.filter(log => Boolean(log.completed_at))
    const travelMs = logs.reduce((sum, log) => sum + logTravelMs(log), 0)
    const serviceMs = logs.reduce((sum, log) => sum + logServiceMs(log), 0)
    const totalMs = logs.reduce((sum, log) => sum + logTotalMs(log), 0)
    return {
      id: person.id,
      name: person.full_name,
      jobs: completedLogs.length,
      travelMs,
      serviceMs,
      totalMs,
      avgMs: completedLogs.length ? Math.round(totalMs / completedLogs.length) : 0
    }
  }).filter(row => row.jobs > 0 || row.totalMs > 0).sort((a,b) => b.totalMs - a.totalMs)

  const dailyPersonnelPerformance = serviceProfiles.map(person => {
    const logs = serviceTimeLogs
      .filter(log => log.user_id === person.id && isTodayLog(log))
      .sort((a,b) => +new Date(a.en_route_at || a.on_site_at || a.created_at) - +new Date(b.en_route_at || b.on_site_at || b.created_at))

    const completedLogs = logs.filter(log => Boolean(log.completed_at))
    const firstDeparture = logs
      .map(log => log.en_route_at)
      .filter(Boolean)
      .sort((a,b) => +new Date(a!) - +new Date(b!))[0] || null
    const lastCompletion = completedLogs
      .map(log => log.completed_at)
      .filter(Boolean)
      .sort((a,b) => +new Date(b!) - +new Date(a!))[0] || null

    const travelMs = logs.reduce((sum, log) => sum + logTravelMs(log), 0)
    const serviceMs = logs.reduce((sum, log) => sum + logServiceMs(log), 0)
    const activeMs = logs.reduce((sum, log) => sum + logTotalMs(log), 0)
    const shiftEndMs = lastCompletion ? new Date(lastCompletion).getTime() : (firstDeparture ? clockTick : 0)
    const fieldShiftMs = firstDeparture ? Math.max(0, shiftEndMs - new Date(firstDeparture).getTime()) : 0
    const live = serviceLiveStatuses.find(s => s.user_id === person.id)
    const liveLabel = live?.status === 'en_route' ? 'Yolda' : live?.status === 'on_site' ? 'Serviste' : 'Müsait'

    return {
      id: person.id,
      name: person.full_name,
      completedJobs: completedLogs.length,
      firstDeparture,
      lastCompletion,
      travelMs,
      serviceMs,
      activeMs,
      avgServiceMs: completedLogs.length ? Math.round(serviceMs / completedLogs.length) : 0,
      fieldShiftMs,
      liveLabel,
      liveStatus: live?.status || 'available'
    }
  }).sort((a,b) => {
    if (a.liveStatus !== 'available' && b.liveStatus === 'available') return -1
    if (a.liveStatus === 'available' && b.liveStatus !== 'available') return 1
    return b.activeMs - a.activeMs
  })

  const dailyCompletedTotal = dailyPersonnelPerformance.reduce((sum, row) => sum + row.completedJobs, 0)
  const dailyActiveTotalMs = dailyPersonnelPerformance.reduce((sum, row) => sum + row.activeMs, 0)
  const dailyTravelTotalMs = dailyPersonnelPerformance.reduce((sum, row) => sum + row.travelMs, 0)
  const dailyServiceTotalMs = dailyPersonnelPerformance.reduce((sum, row) => sum + row.serviceMs, 0)

  const maintenanceJobs = jobs.filter(j => j.next_maintenance_at).sort((a,b) => +new Date(a.next_maintenance_at!) - +new Date(b.next_maintenance_at!))
  const dueMaintenance = maintenanceJobs.filter(j => new Date(j.next_maintenance_at!).getTime() <= Date.now() + 30 * 86400000)

  const calendarAnchorDate = new Date(`${calendarAnchor}T12:00:00`)
  const calendarYear = calendarAnchorDate.getFullYear()
  const calendarMonthIndex = calendarAnchorDate.getMonth()
  const monthFirst = new Date(calendarYear, calendarMonthIndex, 1, 12)
  const mondayOffset = (monthFirst.getDay() + 6) % 7
  const monthGridStart = new Date(monthFirst); monthGridStart.setDate(monthGridStart.getDate() - mondayOffset)
  const calendarMonthDays = Array.from({ length: 42 }, (_, i) => { const d = new Date(monthGridStart); d.setDate(d.getDate() + i); return d })
  const weekStart = new Date(calendarAnchorDate); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const calendarWeekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d })
  const calendarDays = calendarMode === 'month' ? calendarMonthDays : calendarWeekDays
  const jobsForDay = (d: Date) => jobs.filter(j => new Date(j.scheduled_at).toDateString() === d.toDateString()).sort((a,b)=>+new Date(a.scheduled_at)-+new Date(b.scheduled_at))
  const shiftCalendar = (amount: number) => {
    const d = new Date(`${calendarAnchor}T12:00:00`)
    if (calendarMode === 'month') d.setMonth(d.getMonth() + amount)
    else d.setDate(d.getDate() + amount * 7)
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000)
    setCalendarAnchor(local.toISOString().slice(0,10))
  }

  const dashboardTodayJobs = jobs.filter(j => new Date(j.scheduled_at).toDateString() === new Date().toDateString())
  const dashboardOpen = jobs.filter(j => j.status !== 'completed')
  const dashboardLate = dashboardOpen.filter(j => new Date(j.scheduled_at).getTime() < Date.now())
  const dashboardThisMonth = jobs.filter(j => { const d=new Date(j.scheduled_at), n=new Date(); return d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear() })
  const dashboardCompletedMonth = dashboardThisMonth.filter(j => j.status === 'completed').length
  const dashboardCompletionRate = dashboardThisMonth.length ? Math.round(dashboardCompletedMonth / dashboardThisMonth.length * 100) : 0
  const dashboardLast7 = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(6-i)); return { d, count: jobs.filter(j=>new Date(j.scheduled_at).toDateString()===d.toDateString()).length, completed: jobs.filter(j=>new Date(j.scheduled_at).toDateString()===d.toDateString()&&j.status==='completed').length } })

  const dashboardUrgent = jobs
    .filter(j => j.status !== 'completed' && j.priority === 'urgent')
    .sort((a,b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
  const dashboardUnassigned = jobs
    .filter(j => j.status !== 'completed' && !j.assigned_to)
    .sort((a,b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
  const dashboardAvailableServices = serviceStatusRows.filter(r => r.liveStatus === 'available')
  const dashboardWorkingServices = serviceStatusRows.filter(r => r.liveStatus === 'on_site')
  const dashboardAttentionMap = new Map<string, Job>()
  ;[...dashboardUrgent, ...dashboardLate].forEach(j => dashboardAttentionMap.set(j.id, j))
  const dashboardAttention = Array.from(dashboardAttentionMap.values())
    .sort((a,b) => {
      const au = a.priority === 'urgent' ? 0 : 1
      const bu = b.priority === 'urgent' ? 0 : 1
      if (au !== bu) return au - bu
      return +new Date(a.scheduled_at) - +new Date(b.scheduled_at)
    })
    .slice(0, 8)

  const myLiveStatus = serviceLiveStatuses.find(s => s.user_id === currentUserId)
  const myLiveJob = myLiveStatus?.job_id ? jobs.find(j => j.id === myLiveStatus.job_id) : null
  const myLiveLabel = myLiveStatus?.status === 'en_route' ? 'Yola Çıktı' : myLiveStatus?.status === 'on_site' ? 'Serviste / İşlemde' : 'Müsait'

  const viewTitle =
    view === 'calendar' ? 'Takvim & Planlama' :
    view === 'maintenance' ? 'Periyodik Bakımlar' :
    view === 'dashboard' ? 'Yönetici Dashboard' :
    view === 'personnel' ? 'Personel Yönetimi' :
    view === 'customers' ? 'Müşteri Kartları' :
    view === 'reports' ? 'Raporlar' : 'İş Programı'
  const viewSubtitle =
    view === 'calendar' ? 'Haftalık ve aylık iş planını görüntüleyin' :
    view === 'maintenance' ? 'Yaklaşan periyodik bakımları planlayın' :
    view === 'dashboard' ? 'Operasyonun güncel özetini tek ekranda görün' :
    view === 'personnel' ? 'Ofis ve servis kullanıcılarını yönetin' :
    view === 'customers' ? 'Müşteri bilgileri, adresler ve tüm servis geçmişi' :
    view === 'reports' ? 'Tarih aralığı, servis performansı ve dışa aktarma' :
    new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(new Date())

  return <main className="shell">
    {!isOnline && <div className="connectionBanner">İnternet bağlantısı yok. Değişiklikler bağlantı geri geldiğinde tekrar denenebilir.</div>}
    {toast && <div className={`appToast ${toast.type}`}>{toast.message}</div>}
    <aside className="sidebar">
      <div className="brand"><img className="brandLogo" src="/sutek-logo.png" alt="SUTEK"/><div><b>SUTEK</b><small>İş Takip Sistemi</small></div></div>
      <nav>
        <button className={view === 'jobs' && filter === 'bugun' ? 'active' : ''} onClick={() => { setView('jobs'); setFilter('bugun') }}>Bugünün İşleri</button>
        <button className={view === 'jobs' && filter === 'bekleyen' ? 'active' : ''} onClick={() => { setView('jobs'); setFilter('bekleyen') }}>Bekleyen İşler</button>
        <button className={view === 'jobs' && filter === 'tamamlanan' ? 'active' : ''} onClick={() => { setView('jobs'); setFilter('tamamlanan') }}>Tamamlananlar</button>
        <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>Takvim & Planlama</button>
        <button className={view === 'customers' ? 'active' : ''} onClick={() => setView('customers')}>Müşteri Kartları</button>
        {canSeeReports && <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</button>}
        {canSeeReports && <button className={view === 'maintenance' ? 'active' : ''} onClick={() => setView('maintenance')}>Periyodik Bakım</button>}
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
          {(view === 'jobs' || view === 'calendar') && canCreate && <button className="primary" onClick={() => setShowForm(true)}>+ Yeni İş</button>}
          {view === 'personnel' && role === 'admin' && <button className="primary" onClick={() => setShowPersonnelForm(true)}>+ Personel Ekle</button>}
        </div>
      </header>

      {showNotices && <div className="noticePanel">
        <div className="noticeHead"><h3>Bildirimler</h3><button onClick={markAllRead}>Tümünü okundu yap</button></div>
        {notices.length === 0 ? <p className="muted">Henüz bildirim yok.</p> : notices.map(n => <article key={n.id} className={n.is_read ? 'read' : ''}><b>{n.title || 'Bildirim'}</b><span>{n.message}</span><small>{new Date(n.created_at).toLocaleString('tr-TR')}</small></article>)}
      </div>}

      {view === 'jobs' ? <>
        {role === 'service' && <div className="serviceOpsSummary">
          <div className="serviceOpsTitle"><div><h2>Servis Operasyon</h2><p>Kendinize atanmış işler listede otomatik olarak en üste gelir.</p></div><span>{myAssignedOpen.length} açık görev</span></div>
          <div className={`myLiveStatusBar ${myLiveStatus?.status || 'available'}`}>
            <div><span className="livePulse"></span><b>{myLiveLabel}</b><small>{myLiveJob ? `${myLiveJob.service_no || ''} · ${myLiveJob.customer_name}` : 'Aktif servis işi yok'}</small>{myLiveJob && (() => { const log = serviceTimeLogs.find(x => x.job_id === myLiveJob.id && x.user_id === currentUserId); return log ? <em>{myLiveStatus?.status === 'en_route' ? `Yolda: ${formatDuration(logTravelMs(log))}` : myLiveStatus?.status === 'on_site' ? `Serviste: ${formatDuration(logServiceMs(log))}` : ''}</em> : null })()}</div>
            {myLiveStatus?.status && myLiveStatus.status !== 'available' && <button onClick={() => setMyServiceLiveStatus('available')}>Müsaitim</button>}
          </div>
          <div className="serviceOpsCards">
            <article><span>Bana Atanan</span><strong>{myAssignedOpen.length}</strong></article>
            <article><span>Acil</span><strong>{myAssignedUrgent}</strong></article>
            <article><span>Geciken</span><strong>{myAssignedLate}</strong></article>
            <article><span>Bugün</span><strong>{myAssignedToday}</strong></article>
          </div>
        </div>}
        {(role === 'admin' || role === 'office') && serviceStatusRows.length > 0 && <div className="serviceStatusPanel">
          <div className="serviceOpsTitle"><div><h2>Servis Durumu</h2><p>Atanan işlerin personel bazında güncel durumu.</p></div><span>{serviceStatusRows.length} servis personeli</span></div>
          <div className="serviceStatusGrid">
            {serviceStatusRows.map(row => <article key={row.id}>
              <h3>{row.name}</h3>
              <div><span><b>{row.pending}</b> Bekliyor</span><span><b>{row.inProgress}</b> İşlemde</span><span><b>{row.completed}</b> Tamamlandı</span><span><b>{row.postponed}</b> Ertelendi</span></div>
            </article>)}
          </div>
        </div>}
        <div className="stats">
          <article><span>Bugünkü iş</span><strong>{jobs.filter(j => new Date(j.scheduled_at).toDateString() === today).length}</strong></article>
          <article><span>Bekleyen</span><strong>{jobs.filter(j => j.status === 'pending' || j.status === 'in_progress').length}</strong></article>
          <article><span>Tamamlanan</span><strong>{jobs.filter(j => j.status === 'completed').length}</strong></article>
          <article><span>Ertelenen</span><strong>{jobs.filter(j => j.status === 'postponed').length}</strong></article>
        </div>

        <div className="panel">
          <div className="panelHead jobPanelHead">
            <div><h2>{filter === 'bugun' ? 'Bugünün İşleri' : filter === 'bekleyen' ? 'Bekleyen İşler' : 'Tamamlanan İşler'}</h2><input className="searchInput" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Müşteri, telefon, servis veya iş ara…" /></div>
            <div className="quickFilters"><button className={jobQuickFilter==='all'?'selected':''} onClick={()=>setJobQuickFilter('all')}>Tümü</button><button className={jobQuickFilter==='urgent'?'selected':''} onClick={()=>setJobQuickFilter('urgent')}>Acil</button><button className={jobQuickFilter==='late'?'selected':''} onClick={()=>setJobQuickFilter('late')}>Geciken</button><button className={jobQuickFilter==='upcoming'?'selected':''} onClick={()=>setJobQuickFilter('upcoming')}>Yaklaşan</button><span>{displayJobs.length} kayıt</span></div>
          </div>
          {loading ? <div className="empty">Yükleniyor…</div> : displayJobs.length === 0 ? <div className="empty">Bu bölümde iş bulunmuyor.</div> :
            <div className="jobList">{displayJobs.map(job => {
              const late = job.status !== 'completed' && new Date(job.scheduled_at).getTime() < Date.now()
              const diff = new Date(job.scheduled_at).getTime() - Date.now()
              const upcoming = job.status !== 'completed' && diff >= 0 && diff <= 2 * 60 * 60 * 1000
              return <article className={`job ${job.priority === 'urgent' ? 'urgentJob' : ''} ${late ? 'lateJob' : upcoming ? 'upcomingJob' : ''}`} key={job.id}>
              <div className="time"><strong>{new Date(job.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</strong><small>{new Date(job.scheduled_at).toLocaleDateString('tr-TR')}</small></div>
              <div className="jobInfo">
                <div className="jobTitle"><h3>{job.customer_name}</h3><span className={`badge ${job.status}`}>{statusText[job.status]}</span>{job.priority === 'urgent' && <span className="priorityBadge">ACİL</span>}{late && <span className="lateBadge">GECİKTİ</span>}{!late && upcoming && <span className="upcomingBadge">YAKLAŞIYOR</span>}</div>
                <a href={`tel:${job.customer_phone}`}>{job.customer_phone}</a>
                {job.customer_address && <div className="jobAddress">📍 {job.customer_address}</div>}
                <p>{job.description}</p>
                <div className="jobMeta"><small>Servis No: <b>{job.service_no || '-'}</b></small><small>Ekleyen: <b>{job.creator?.full_name || job.created_by_name || 'SUTEK Personeli'}</b></small><small className={job.assigned_to === currentUserId ? 'assignedMe' : ''}>Servis: <b>{job.assignee?.full_name || 'Atanmadı'}</b></small></div>
              </div>
              <div className="actions smartActions">
                <div className="primaryJobActions">
                  <a className="actionLink" href={`tel:${job.customer_phone}`}>Ara</a>
                  {job.customer_address && <button onClick={() => setNavigationJob(job)}>Navigasyon</button>}
                  <button onClick={() => setHistoryPhone(job.customer_phone)}>Müşteri Kartı</button>
                  <button onClick={() => openReport(job)}>{serviceReports.some(r => r.job_id === job.id) ? 'Servis Formu' : 'Servis Formu Oluştur'}</button>
                  {role === 'service' && job.assigned_to === currentUserId && job.status !== 'completed' && job.status !== 'postponed' && <>
                    {(!myLiveStatus || myLiveStatus.status === 'available' || myLiveStatus.job_id !== job.id) && <button className="enRouteBtn" onClick={() => setMyServiceLiveStatus('en_route', job.id)}>🚗 Yola Çıktım</button>}
                    {myLiveStatus?.job_id === job.id && myLiveStatus.status === 'en_route' && <button className="onSiteBtn" onClick={() => setMyServiceLiveStatus('on_site', job.id)}>📍 Servisteyim</button>}
                    {myLiveStatus?.job_id === job.id && myLiveStatus.status === 'on_site' && <span className="liveJobBadge">● Serviste</span>}
                  </>}
                  {canOperate && job.status !== 'completed' && <>
                    {job.status !== 'in_progress' && <button onClick={() => setStatus(job, 'in_progress')}>İşleme Al</button>}
                    <button className="success" onClick={() => completeJob(job)}>✓ Tamamlandı</button>
                    {job.status !== 'postponed' && <button className="warning" onClick={() => setStatus(job, 'postponed')}>↻ Ertele</button>}
                  </>}
                  {canSchedule && job.status === 'postponed' && <button className="primary" onClick={() => rescheduleJob(job)}>📅 Tarih Belirle</button>}
                </div>

                <details className="moreActions">
                  <summary>Diğer İşlemler</summary>
                  <div className="moreActionsMenu">
                    {canSchedule && <button onClick={() => setEditJob(job)}>Düzenle</button>}
                    <button onClick={() => setCommentsJob(job)}>Notlar ({jobComments.filter(c => c.job_id === job.id).length})</button>
                    <button onClick={() => setSignatureJob(job)}>{job.signature_path ? 'İmzayı Gör/Yenile' : 'Müşteri İmzası'}</button>
                    <button onClick={() => setFilesJob(job)}>Dosyalar ({attachments.filter(a => a.job_id === job.id).length})</button>
                    <button onClick={() => uploadJobFile(job)} disabled={fileBusy}>+ Dosya</button>
                    {serviceReports.some(r => r.job_id === job.id) && <button onClick={() => printServiceForm(job)}>PDF</button>}
                    {job.customer_report && <button className="whatsappBtn" onClick={() => whatsappCustomerReport(job)}>WhatsApp</button>}
                    {canSchedule && <button className="dangerBtn" onClick={() => deleteJob(job)}>Sil</button>}
                  </div>
                </details>
                {role === 'office' && job.status !== 'postponed' && job.status !== 'completed' && <span className="roleHint">Durumu servis günceller</span>}
              </div>
            </article>})}</div>}
        </div>
      </> : view === 'calendar' ?
        <div className="panel calendarPanel">
          <div className="calendarToolbar">
            <div className="calendarNav"><button onClick={() => shiftCalendar(-1)}>‹</button><button onClick={() => setCalendarAnchor(localDateInputValue())}>Bugün</button><button onClick={() => shiftCalendar(1)}>›</button></div>
            <h2>{calendarMode === 'month' ? new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(calendarAnchorDate) : `${calendarWeekDays[0].toLocaleDateString('tr-TR')} - ${calendarWeekDays[6].toLocaleDateString('tr-TR')}`}</h2>
            <div className="calendarModes"><button className={calendarMode==='week'?'selected':''} onClick={()=>setCalendarMode('week')}>Hafta</button><button className={calendarMode==='month'?'selected':''} onClick={()=>setCalendarMode('month')}>Ay</button></div>
          </div>
          <div className={`calendarGrid ${calendarMode}`}>
            {calendarMode === 'month' && ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d => <div className="calendarWeekday" key={d}>{d}</div>)}
            {calendarDays.map(day => <div key={day.toISOString()} className={`calendarDay ${day.getMonth()!==calendarMonthIndex && calendarMode==='month'?'otherMonth':''} ${day.toDateString()===new Date().toDateString()?'today':''}`}>
              <div className="calendarDayHead"><b>{day.getDate()}</b><span>{calendarMode==='week' ? day.toLocaleDateString('tr-TR',{weekday:'short'}) : ''}</span></div>
              <div className="calendarJobs">{jobsForDay(day).map(job => <button key={job.id} className={`calendarJob ${job.priority==='urgent'?'urgent':''}`} onClick={() => canSchedule ? setEditJob(job) : setCommentsJob(job)}><span>{new Date(job.scheduled_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span><b>{job.customer_name}</b><small>{job.assignee?.full_name || 'Atama yok'}</small></button>)}</div>
            </div>)}
          </div>
        </div>
      : view === 'dashboard' && canSeeReports ?
        <>
          <div className="dashboardCards operationSummaryCards">
            <article><span>Bugünkü İş</span><strong>{dashboardTodayJobs.length}</strong><small>{dashboardTodayJobs.filter(j=>j.status==='completed').length} tamamlandı</small></article>
            <article className={dashboardLate.length ? 'attentionCard' : ''}><span>Geciken</span><strong>{dashboardLate.length}</strong><small>{dashboardLate.length ? 'Müdahale gerekiyor' : 'Geciken iş yok'}</small></article>
            <article className={dashboardUrgent.length ? 'urgentCard' : ''}><span>Acil İş</span><strong>{dashboardUrgent.length}</strong><small>{dashboardUrgent.length ? 'Öncelikli takip' : 'Acil iş yok'}</small></article>
            <article className={dashboardUnassigned.length ? 'unassignedCard' : ''}><span>Atanmamış</span><strong>{dashboardUnassigned.length}</strong><small>{dashboardUnassigned.length ? 'Servis bekliyor' : 'Tüm işler atanmış'}</small></article>
          </div>

          <div className="operationGrid">
            <div className="panel operationAttentionPanel">
              <div className="panelHead">
                <div><h2>Müdahale Gerekenler</h2><p className="muted">Acil veya geciken açık işler</p></div>
                <span>{dashboardAttention.length} iş</span>
              </div>
              {dashboardAttention.length === 0 ? <div className="operationGoodState">✓ Şu anda acil müdahale gerektiren iş yok.</div> :
                <div className="operationJobList">{dashboardAttention.map(job => {
                  const isLate = new Date(job.scheduled_at).getTime() < Date.now()
                  return <article key={job.id} className={`operationJobRow ${job.priority === 'urgent' ? 'urgent' : ''} ${isLate ? 'late' : ''}`}>
                    <div className="operationJobTime"><strong>{new Date(job.scheduled_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</strong><small>{new Date(job.scheduled_at).toLocaleDateString('tr-TR')}</small></div>
                    <div className="operationJobMain">
                      <div><b>{job.customer_name}</b>{job.priority === 'urgent' && <span className="opUrgentBadge">ACİL</span>}{isLate && <span className="opLateBadge">GECİKTİ</span>}</div>
                      <span>{job.service_no || '-'} · {job.assignee?.full_name || 'Servis atanmamış'}</span>
                    </div>
                    <div className="operationJobActions">
                      <button onClick={() => setHistoryPhone(job.customer_phone)}>Müşteri</button>
                      {canSchedule && <button className="primary" onClick={() => setEditJob(job)}>Düzenle</button>}
                    </div>
                  </article>
                })}</div>}
            </div>

            <div className="operationSideStack">
              <div className="panel serviceAvailabilityPanel">
                <div className="panelHead"><div><h2>Servis Durumu</h2><p className="muted">Anlık iş yükü ve müsaitlik</p></div><span>{serviceStatusRows.length} personel</span></div>
                <div className="serviceAvailabilityList">
                  {serviceStatusRows.length === 0 ? <div className="empty compactEmpty">Aktif servis personeli yok.</div> :
                    serviceStatusRows.map(row => {
                      const stateClass = row.liveStatus === 'available' ? 'available' : row.liveStatus === 'on_site' ? 'working' : 'enRoute'
                      const stateText = row.liveStatus === 'available' ? 'Müsait' : row.liveStatus === 'on_site' ? 'Serviste' : 'Yolda'
                      return <article key={row.id}>
                        <div className="serviceAvailabilityName"><span className={`availabilityDot ${stateClass}`}></span><b>{row.name}</b></div>
                        <span className={`availabilityState ${stateClass}`}>{stateText}</span>
                        <small>{row.liveJobCustomer ? `Aktif: ${row.liveJobCustomer} · ` : ''}{row.pending} bekleyen · {row.inProgress} işlemde</small>
                        <div className="serviceTodayTimes"><span>Yol <b>{formatDuration(row.todayTravelMs)}</b></span><span>Servis <b>{formatDuration(row.todayServiceMs)}</b></span><span>Toplam <b>{formatDuration(row.todayTotalMs)}</b></span></div>
                      </article>
                    })}
                </div>
              </div>

              <div className="panel unassignedPanel">
                <div className="panelHead"><div><h2>Atama Bekleyen</h2><p className="muted">Henüz servis personeli seçilmemiş işler</p></div><span>{dashboardUnassigned.length}</span></div>
                {dashboardUnassigned.length === 0 ? <div className="operationGoodState compact">✓ Atanmamış iş yok.</div> :
                  <div className="unassignedList">{dashboardUnassigned.slice(0,5).map(job =>
                    <button key={job.id} onClick={() => canSchedule ? setEditJob(job) : setHistoryPhone(job.customer_phone)}>
                      <span><b>{job.customer_name}</b><small>{new Date(job.scheduled_at).toLocaleString('tr-TR')}</small></span><strong>Atama Yap →</strong>
                    </button>
                  )}</div>}
              </div>
            </div>
          </div>

          <div className="panel dailyPerformancePanel">
            <div className="panelHead">
              <div>
                <h2>Günlük Personel Performansı</h2>
                <p className="muted">Bugünkü saha hareketleri ve servis süreleri</p>
              </div>
              <span>{new Date().toLocaleDateString('tr-TR')}</span>
            </div>
            <div className="dailyPerformanceSummary">
              <article><span>Tamamlanan İş</span><strong>{dailyCompletedTotal}</strong></article>
              <article><span>Toplam Aktif Süre</span><strong>{formatDuration(dailyActiveTotalMs)}</strong></article>
              <article><span>Toplam Yol</span><strong>{formatDuration(dailyTravelTotalMs)}</strong></article>
              <article><span>Toplam Servis</span><strong>{formatDuration(dailyServiceTotalMs)}</strong></article>
            </div>
            <div className="dailyPerformanceTable">
              <div className="dailyPerformanceRow dailyPerformanceHead">
                <span>Personel</span><span>Durum</span><span>İlk Çıkış</span><span>Son Bitiş</span><span>İş</span><span>Yolda</span><span>Serviste</span><span>Aktif</span><span>Saha Mesaisi</span><span>Ort. Servis</span>
              </div>
              {dailyPersonnelPerformance.map(row => <div className="dailyPerformanceRow" key={row.id}>
                <b>{row.name}</b>
                <span><i className={`performanceStatus ${row.liveStatus}`}></i>{row.liveLabel}</span>
                <span>{formatClock(row.firstDeparture)}</span>
                <span>{formatClock(row.lastCompletion)}</span>
                <span>{row.completedJobs}</span>
                <span>{formatDuration(row.travelMs)}</span>
                <span>{formatDuration(row.serviceMs)}</span>
                <span><b>{formatDuration(row.activeMs)}</b></span>
                <span>{formatDuration(row.fieldShiftMs)}</span>
                <span>{formatDuration(row.avgServiceMs)}</span>
              </div>)}
            </div>
            <p className="dailyPerformanceNote">Saha mesaisi, ilk “Yola Çıktım” kaydı ile son tamamlanan iş arasındaki süredir; resmi puantaj/bordro mesaisi değildir.</p>
          </div>

          <div className="dashboardGrid operationLowerGrid">
            <div className="panel"><div className="panelHead"><div><h2>Son 7 Gün</h2><p className="muted">Günlük iş ve tamamlanma özeti</p></div></div><div className="weekSummary">{dashboardLast7.map(x=><article key={x.d.toISOString()}><span>{x.d.toLocaleDateString('tr-TR',{weekday:'short'})}</span><strong>{x.count}</strong><small>{x.completed} tamamlandı</small></article>)}</div></div>
            <div className="panel"><div className="panelHead"><div><h2>Aylık Özet</h2><p className="muted">Bu ayın operasyon performansı</p></div></div><div className="monthlyOperationSummary">
              <div><span>Bu Ay Tamamlanan</span><strong>{dashboardCompletedMonth}</strong></div>
              <div><span>Tamamlama Oranı</span><strong>%{dashboardCompletionRate}</strong></div>
              <div><span>Bakım Bekleyen</span><strong>{dueMaintenance.length}</strong></div>
              <div><span>Müsait Servis</span><strong>{dashboardAvailableServices.length}</strong></div>
            </div></div>
          </div>
        </>
      : view === 'maintenance' && canSeeReports ?
        <div className="panel maintenancePanel">
          <div className="panelHead"><div><h2>Periyodik Bakımlar</h2><p className="muted">Tamamlanan işlerde seçilen bakım periyoduna göre otomatik hesaplanır.</p></div><span>{maintenanceJobs.length} bakım</span></div>
          {maintenanceJobs.length===0 ? <div className="empty">Planlanmış periyodik bakım bulunmuyor.</div> : <div className="maintenanceList">{maintenanceJobs.map(job=>{
            const overdue = new Date(job.next_maintenance_at!).getTime() < Date.now()
            return <article key={job.id} className={overdue?'maintenanceOverdue':''}><div><b>{job.customer_name}</b><span>{job.service_no}</span><small>{job.customer_phone}</small></div><div><span>Bakım tarihi</span><strong>{new Date(job.next_maintenance_at!).toLocaleDateString('tr-TR')}</strong><small>{job.repeat_months} ayda bir</small></div><div className="maintenanceActions"><button onClick={()=>setHistoryPhone(job.customer_phone)}>Müşteri Kartı</button><button className="primary" onClick={()=>createMaintenanceJob(job)}>Bakım İşini Oluştur</button></div></article>
          })}</div>}
        </div>
      : view === 'customers' ?
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
                <button onClick={() => setHistoryPhone(customer.phone)}>Müşteri Kartını Aç</button>
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
            <div className="panelHead"><div><h2>Servis Personeli Performansı</h2><p className="muted reportIntro">Servis kullanıcısının yaptığı gerçek durum değişikliklerinden hesaplanır.</p></div><span>{servicePerformanceReports.length} servis</span></div>
            {servicePerformanceReports.length === 0 ? <div className="empty">Bu tarih aralığında servis işlemi bulunmuyor.</div> :
              <div className="reportTable">
                <div className="serviceReportRow reportHead"><span>Servis Personeli</span><span>Tamamladı</span><span>Erteledi</span><span>Toplam İşlem</span></div>
                {servicePerformanceReports.map(r => <div className="serviceReportRow" key={r.name}><b>{r.name}</b><span>{r.completed}</span><span>{r.postponed}</span><span>{r.completed + r.postponed}</span></div>)}
              </div>}
          </div>
          <div className="panel serviceTimeReportPanel">
            <div className="panelHead"><div><h2>Servis Süreleri</h2><p className="muted reportIntro">Yola çıkış, müşteriye varış ve tamamlanma kayıtlarından hesaplanır.</p></div><span>{serviceTimeReports.length} servis</span></div>
            {serviceTimeReports.length === 0 ? <div className="empty">Bu tarih aralığında süre kaydı bulunmuyor.</div> :
              <div className="serviceTimeTable">
                <div className="serviceTimeRow serviceTimeHead"><span>Servis Personeli</span><span>İş</span><span>Yolda</span><span>Serviste</span><span>Toplam</span><span>Ort. / İş</span></div>
                {serviceTimeReports.map(r => <div className="serviceTimeRow" key={r.id}><b>{r.name}</b><span>{r.jobs}</span><span>{formatDuration(r.travelMs)}</span><span>{formatDuration(r.serviceMs)}</span><span><b>{formatDuration(r.totalMs)}</b></span><span>{formatDuration(r.avgMs)}</span></div>)}
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

    {commentsJob && <div className="modalBackdrop" onMouseDown={() => setCommentsJob(null)}>
      <div className="modal commentsModal" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHead"><div><h2>İş İçi Notlar</h2><p>{commentsJob.service_no} · {commentsJob.customer_name}</p></div><button onClick={() => setCommentsJob(null)}>×</button></div>
        <div className="commentList">{jobComments.filter(c=>c.job_id===commentsJob.id).length===0 ? <div className="empty compactEmpty">Henüz not yok.</div> : jobComments.filter(c=>c.job_id===commentsJob.id).map(c=><article key={c.id} className={c.author_id===currentUserId?'myComment':''}><div><b>{c.author?.full_name || 'Personel'}</b><small>{new Date(c.created_at).toLocaleString('tr-TR')}</small></div><p>{c.message}</p>{(c.author_id===currentUserId||role==='admin')&&<button onClick={()=>deleteJobComment(c)}>Sil</button>}</article>)}</div>
        <div className="commentComposer"><textarea rows={3} value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} placeholder="Sadece SUTEK ekibinin göreceği notu yazın…"/><button className="primary" onClick={addJobComment}>Not Ekle</button></div>
      </div>
    </div>}

    {signatureJob && <div className="modalBackdrop" onMouseDown={() => setSignatureJob(null)}>
      <div className="modal signatureModal" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHead"><div><h2>Müşteri Onayı / İmza</h2><p>{signatureJob.service_no} · {signatureJob.customer_name}</p></div><button onClick={() => setSignatureJob(null)}>×</button></div>
        {signatureJob.signature_path && <div className="existingSignature"><span>Bu iş için daha önce imza alındı: <b>{signatureJob.signature_name}</b></span><small>{signatureJob.signed_at ? new Date(signatureJob.signed_at).toLocaleString('tr-TR') : ''}</small></div>}
        <p className="signatureHelp">Müşteri aşağıdaki alana parmağı veya mouse ile imza atabilir.</p>
        <canvas ref={signatureCanvasRef} className="signatureCanvas" width={700} height={230} onPointerDown={signatureStart} onPointerMove={signatureMove} onPointerUp={signatureEnd} onPointerCancel={signatureEnd} onPointerLeave={signatureEnd}/>
        <div className="formActions"><button onClick={clearSignature}>Temizle</button><button className="primary" onClick={saveSignature}>İmzayı Kaydet</button></div>
      </div>
    </div>}

    {navigationJob && <div className="modalBackdrop" onMouseDown={() => setNavigationJob(null)}>
      <div className="modal navigationModal" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHead"><div><h2>Navigasyon Seç</h2><p>{navigationJob.customer_name}</p></div><button onClick={() => setNavigationJob(null)}>×</button></div>
        <div className="navigationAddress">📍 {navigationJob.customer_address}</div>
        <div className="navigationChoices">
          <button onClick={() => openNavigation('google', navigationJob.customer_address)}><b>Google Maps</b><span>Google Maps ile aç</span></button>
          <button onClick={() => openNavigation('apple', navigationJob.customer_address)}><b>Apple Maps</b><span>Apple Haritalar ile aç</span></button>
          <button onClick={() => openNavigation('yandex', navigationJob.customer_address)}><b>Yandex Navigasyon</b><span>Yandex Maps ile aç</span></button>
        </div>
      </div>
    </div>}

    {editJob && canSchedule && <div className="modalBackdrop" onMouseDown={() => setEditJob(null)}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHead"><div><h2>İşi Düzenle</h2><p>{editJob.customer_name}</p></div><button onClick={() => setEditJob(null)}>×</button></div>
        <form onSubmit={saveJobEdit}>
          <div className="grid2"><label>Tarih<input name="date" type="date" required defaultValue={localDateForJob(editJob.scheduled_at)} /></label><label>Saat<input name="time" type="time" required defaultValue={localTimeForJob(editJob.scheduled_at)} /></label></div>
          <label>Müşteri Adı<input name="customer_name" required defaultValue={editJob.customer_name} /></label>
          <label>Telefon<input name="customer_phone" required inputMode="tel" defaultValue={editJob.customer_phone} /></label>
          <label>Adres (isteğe bağlı)<input name="customer_address" defaultValue={editJob.customer_address || ''} placeholder="Servisin gideceği adres" /></label>
          <label>Yapılacak İş<textarea name="description" required rows={4} defaultValue={editJob.description} /></label>
          <div className="grid2">
            <label>Periyodik Bakım<select name="repeat_months" defaultValue={editJob.repeat_months || ''}><option value="">Tek seferlik</option><option value="1">Her 1 ay</option><option value="3">Her 3 ay</option><option value="6">Her 6 ay</option><option value="12">Her 12 ay</option><option value="24">Her 24 ay</option></select></label>
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

    {reportJob && <div className="modalBackdrop" onMouseDown={() => { setReportJob(null); setCompleteAfterReport(false) }}>
      <div className="modal serviceFormModal" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHead"><div><h2>Dijital Servis Formu</h2><p>{reportJob.customer_name} · {reportJob.customer_phone}</p></div><button onClick={() => { setReportJob(null); setCompleteAfterReport(false) }}>×</button></div>
        <div className="serviceFormGrid">
          <label>Yapılan İşlem
            <textarea rows={5} value={workPerformedDraft} onChange={e => setWorkPerformedDraft(e.target.value)} readOnly={!['service','admin'].includes(role)} placeholder="Serviste yapılan işlemleri yazın…" />
          </label>
          <label>Kullanılan / Değiştirilen Parçalar
            <textarea rows={3} value={partsUsedDraft} onChange={e => setPartsUsedDraft(e.target.value)} readOnly={!['service','admin'].includes(role)} placeholder="Örn. mekanik salmastra, rulman, filtre… Parça yoksa boş bırakılabilir." />
          </label>
          <label>Müşteriye Gönderilecek Rapor
            <textarea rows={5} value={reportDraft} onChange={e => setReportDraft(e.target.value)} readOnly={!['service','admin'].includes(role)} placeholder="Müşterinin anlayacağı servis sonucu…" />
          </label>
          <label className="internalNoteLabel">Şirket İçi Servis Notu
            <textarea rows={4} value={internalNoteDraft} onChange={e => setInternalNoteDraft(e.target.value)} readOnly={!['service','admin'].includes(role)} placeholder="Sadece SUTEK personelinin göreceği not…" />
            <small>Bu alan PDF ve WhatsApp müşteri raporunda gösterilmez.</small>
          </label>
        </div>
        <div className="serviceFormFileInfo">
          <span>📎 {attachments.filter(a => a.job_id === reportJob.id).length} dosya</span>
          <span>🖼️ {attachments.filter(a => a.job_id === reportJob.id && a.mime_type?.startsWith('image/')).length} fotoğraf</span>
          <button type="button" onClick={() => setFilesJob(reportJob)}>Dosyaları Aç</button>
        </div>
        <div className="serviceExtraActions">{reportJob.repeat_months && <span>Periyodik bakım: <b>{reportJob.repeat_months} ay</b>{reportJob.next_maintenance_at && <> · Sonraki: <b>{new Date(reportJob.next_maintenance_at).toLocaleDateString('tr-TR')}</b></>}</span>}<button type="button" onClick={() => setSignatureJob(reportJob)}>{reportJob.signature_path ? 'İmzayı Gör/Yenile' : 'Müşteri İmzası Al'}</button></div>
        <div className="formActions serviceFormActions">
          {serviceReports.some(r => r.job_id === reportJob.id) && <button type="button" onClick={() => printServiceForm({ ...reportJob, customer_report: reportDraft || reportJob.customer_report })}>PDF Oluştur</button>}
          {(reportDraft || reportJob.customer_report) && <button type="button" className="whatsappBtn" onClick={() => whatsappCustomerReport({ ...reportJob, customer_report: reportDraft || reportJob.customer_report })}>WhatsApp'ta Paylaş</button>}
          <button type="button" onClick={() => { setReportJob(null); setCompleteAfterReport(false) }}>Kapat</button>
          {['service','admin'].includes(role) && <button className="primary" type="button" disabled={reportBusy} onClick={() => saveServiceForm(completeAfterReport)}>
            {reportBusy ? 'Kaydediliyor…' : completeAfterReport ? 'Kaydet ve Tamamla' : 'Servis Formunu Kaydet'}
          </button>}
        </div>
      </div>
    </div>}

    {historyPhone && <div className="modalBackdrop" onMouseDown={() => setHistoryPhone(null)}><div className="modal historyModal serviceHistoryModal" onMouseDown={e => e.stopPropagation()}><div className="modalHead"><div><h2>Müşteri Kartı</h2><p>{historyPhone} · {historyJobs.length} servis kaydı</p></div><button onClick={() => setHistoryPhone(null)}>×</button></div>{historyJobs.length>0 && <div className="customerCardSummary"><div><span>Müşteri</span><b>{historyJobs[0].customer_name}</b></div><div><span>Telefon</span><b>{historyPhone}</b></div><div><span>Adresler</span><b>{Array.from(new Set(historyJobs.map(j=>j.customer_address).filter(Boolean))).length}</b></div><div><span>Toplam Servis</span><b>{historyJobs.length}</b></div><div><span>Son Servis</span><b>{new Date(historyJobs[0].scheduled_at).toLocaleDateString('tr-TR')}</b></div><div><span>Sonraki Bakım</span><b>{historyJobs.find(j=>j.next_maintenance_at)?.next_maintenance_at ? new Date(historyJobs.find(j=>j.next_maintenance_at)!.next_maintenance_at!).toLocaleDateString('tr-TR') : '-'}</b></div></div>}<div className="historyList">{pagedHistoryJobs.map(h => {
      const sr = serviceReports.find(r => r.job_id === h.id)
      const fileCount = attachments.filter(a => a.job_id === h.id).length
      return <article key={h.id} className="serviceHistoryCard">
        <div><b>{new Date(h.scheduled_at).toLocaleString('tr-TR')} · {h.service_no || ''}</b><span className={`badge ${h.status}`}>{statusText[h.status]}</span></div>
        <h3>{h.customer_name}</h3>
        <p><b>Talep:</b> {h.description}</p>
        {sr && <div className="historyServiceDetails">
          <p><b>Yapılan işlem:</b> {sr.work_performed}</p>
          {sr.parts_used && <p><b>Parça:</b> {sr.parts_used}</p>}
          {h.customer_report && <p><b>Müşteri raporu:</b> {h.customer_report}</p>}
          {sr.internal_note && <p className="internalHistoryNote"><b>İç not:</b> {sr.internal_note}</p>}
        </div>}
        <div className="historyActions">
          {sr && <button onClick={() => openReport(h)}>Servis Formunu Aç</button>}
          {sr && <button onClick={() => printServiceForm(h)}>PDF</button>}
          {fileCount > 0 && <button onClick={() => setFilesJob(h)}>Dosyalar ({fileCount})</button>}
        </div>
      </article>
    })}</div>
    {historyJobs.length > historyPageSize && <div className="historyPagination">
      <button disabled={safeHistoryPage <= 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))}>← Önceki</button>
      <span>{safeHistoryPage} / {historyTotalPages}</span>
      <button disabled={safeHistoryPage >= historyTotalPages} onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}>Sonraki →</button>
    </div>}
    </div></div>}

    {showPersonnelForm && role === 'admin' && <div className="modalBackdrop" onMouseDown={() => setShowPersonnelForm(false)}><div className="modal" onMouseDown={e => e.stopPropagation()}><div className="modalHead"><div><h2>Yeni Personel Ekle</h2><p>Kullanıcı hemen giriş yapabilir.</p></div><button onClick={() => setShowPersonnelForm(false)}>×</button></div><form onSubmit={createPersonnel}><label>Ad Soyad<input name="full_name" required /></label><label>E-posta<input name="email" type="email" required /></label><label>Geçici Şifre<input name="password" type="password" minLength={6} required /></label><label>Rol<select name="role" defaultValue="office"><option value="office">Ofis</option><option value="service">Servis</option><option value="admin">Yönetici</option></select></label>{personnelMessage && <div className="authMessage">{personnelMessage}</div>}<div className="formActions"><button type="button" onClick={() => setShowPersonnelForm(false)}>Vazgeç</button><button className="primary" type="submit" disabled={personnelBusy}>{personnelBusy ? 'Oluşturuluyor…' : 'Personeli Oluştur'}</button></div></form></div></div>}

    {showForm && <div className="modalBackdrop" onMouseDown={() => setShowForm(false)}><div className="modal" onMouseDown={e => e.stopPropagation()}><div className="modalHead"><div><h2>Yeni İş Ekle</h2><p>İş servis bölümüne iletilecek.</p></div><button onClick={() => setShowForm(false)}>×</button></div><form onSubmit={createJob}><div className="grid2"><label>Tarih<input name="date" type="date" required defaultValue={localDateInputValue()} /></label><label>Saat<input name="time" type="time" required /></label></div><label>Müşteri Adı<input name="customer_name" required /></label><label>Telefon<input name="customer_phone" required inputMode="tel" /></label><label>Adres (isteğe bağlı)<input name="customer_address" placeholder="Servisin gideceği adres" /></label><label>Yapılacak İş<textarea name="description" required rows={4} /></label><div className="grid2"><label>Periyodik Bakım<select name="repeat_months" defaultValue=""><option value="">Tek seferlik</option><option value="1">Her 1 ay</option><option value="3">Her 3 ay</option><option value="6">Her 6 ay</option><option value="12">Her 12 ay</option><option value="24">Her 24 ay</option></select></label><label>Öncelik<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="urgent">Acil</option></select></label><label>Servis Personeli<select name="assigned_to" defaultValue=""><option value="">Atama yok</option>{serviceProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label></div><div className="creator">Ekleyen kişi otomatik kaydedilecek: <b>{profileName}</b></div><div className="formActions"><button type="button" onClick={() => setShowForm(false)}>Vazgeç</button><button className="primary" type="submit" disabled={jobCreateBusy}>{jobCreateBusy ? 'Ekleniyor…' : 'İşi Oluştur'}</button></div></form></div></div>}
  </main>
}
