'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '../lib/supabase/client'
import styles from './mobile-service-status.module.css'

type Role = 'admin' | 'office' | 'service'
type LiveState = 'available' | 'en_route' | 'on_site'

type Profile = {
  id: string
  full_name: string
  role: Role
  is_active: boolean
}

type LiveStatus = {
  user_id: string
  status: LiveState
  job_id?: string | null
  updated_at?: string | null
}

type Job = {
  id: string
  customer_name: string
  service_no?: string | null
  assigned_to?: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'postponed'
  scheduled_at: string
}

function stateLabel(state?: LiveState | null) {
  if (state === 'en_route') return 'Yolda'
  if (state === 'on_site') return 'Serviste'
  return 'Müsait'
}

export default function MobileServiceStatus() {
  const supabase = useMemo(() => createClient(), [])
  const [isMobile, setIsMobile] = useState(false)
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [liveStatuses, setLiveStatuses] = useState<LiveStatus[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [])

  async function load() {
    if (!isMobile) return
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) {
      setReady(true)
      setRole(null)
      return
    }

    setUserId(user.id)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id,full_name,role,is_active')
      .eq('id', user.id)
      .single()

    if (!profile?.role) {
      setReady(true)
      return
    }

    const currentRole = profile.role as Role
    setRole(currentRole)

    if (currentRole === 'service') {
      const [{ data: live }, { data: assigned }] = await Promise.all([
        supabase.from('service_live_status').select('user_id,status,job_id,updated_at').eq('user_id', user.id),
        supabase
          .from('jobs')
          .select('id,customer_name,service_no,assigned_to,status,scheduled_at')
          .or(`assigned_to.eq.${user.id},assigned_to.is.null`)
          .in('status', ['pending', 'in_progress'])
          .order('scheduled_at', { ascending: true })
      ])
      setProfiles([profile as Profile])
      setLiveStatuses((live ?? []) as LiveStatus[])
      setJobs((assigned ?? []) as Job[])
    } else {
      const [{ data: serviceProfiles }, { data: live }, { data: openJobs }] = await Promise.all([
        supabase.from('profiles').select('id,full_name,role,is_active').eq('role', 'service').eq('is_active', true).order('full_name'),
        supabase.from('service_live_status').select('user_id,status,job_id,updated_at'),
        supabase.from('jobs').select('id,customer_name,service_no,assigned_to,status,scheduled_at').in('status', ['pending', 'in_progress'])
      ])
      setProfiles((serviceProfiles ?? []) as Profile[])
      setLiveStatuses((live ?? []) as LiveStatus[])
      setJobs((openJobs ?? []) as Job[])
    }

    setReady(true)
  }

  useEffect(() => {
    if (!isMobile) return
    void load()
    const timer = window.setInterval(() => void load(), 10000)
    return () => window.clearInterval(timer)
  }, [isMobile])

  async function setMyStatus(status: LiveState, jobId?: string | null) {
    if (role !== 'service' || busy) return
    setBusy(true)
    setMessage('')
    const { error } = await supabase.rpc('set_my_service_status', {
      p_status: status,
      p_job_id: jobId || null
    })
    if (error) {
      setMessage('Durum güncellenemedi.')
    } else {
      setMessage(status === 'en_route' ? 'Yola çıkıldı.' : status === 'on_site' ? 'Servise geçildi.' : 'Müsait olarak güncellendi.')
      await load()
    }
    setBusy(false)
  }

  if (!isMobile || !ready || !role) return null

  const myLive = liveStatuses.find(x => x.user_id === userId)
  const myState: LiveState = myLive?.status || 'available'
  const myActiveJob = myLive?.job_id ? jobs.find(j => j.id === myLive.job_id) : null

  const rows = profiles.map(person => {
    const live = liveStatuses.find(x => x.user_id === person.id)
    const state: LiveState = live?.status || 'available'
    const activeJob = live?.job_id ? jobs.find(j => j.id === live.job_id) : null
    return { person, state, activeJob }
  })

  const enRouteCount = rows.filter(r => r.state === 'en_route').length
  const onSiteCount = rows.filter(r => r.state === 'on_site').length
  const availableCount = rows.filter(r => r.state === 'available').length

  return (
    <div className={styles.wrap}>
      <details className={styles.card}>
        <summary className={styles.summary}>
          <div>
            <b>{role === 'service' ? 'Saha Durumum' : 'Servis Durumu'}</b>
            {role === 'service' ? (
              <span className={`${styles.pill} ${styles[myState]}`}>{stateLabel(myState)}</span>
            ) : (
              <small>{enRouteCount} yolda · {onSiteCount} serviste · {availableCount} müsait</small>
            )}
          </div>
          <span className={styles.chevron}>▾</span>
        </summary>

        <div className={styles.body}>
          {role === 'service' ? (
            <>
              <div className={styles.myStatus}>
                <span className={`${styles.dot} ${styles[myState]}`} />
                <div>
                  <b>{stateLabel(myState)}</b>
                  <small>{myActiveJob ? `${myActiveJob.service_no || ''} · ${myActiveJob.customer_name}` : 'Aktif servis işi yok'}</small>
                </div>
              </div>

              {myState === 'available' && jobs.length > 0 && (
                <div className={styles.jobs}>
                  {jobs.slice(0, 4).map(job => (
                    <button key={job.id} disabled={busy} onClick={() => setMyStatus('en_route', job.id)}>
                      <span><b>{job.customer_name}</b><small>{job.service_no || 'Servis işi'}{!job.assigned_to ? ' · Atanmamış' : ''}</small></span>
                      <strong>{!job.assigned_to ? '🚗 Üstlen & Yola Çık' : '🚗 Yola Çık'}</strong>
                    </button>
                  ))}
                </div>
              )}

              {myState === 'en_route' && (
                <button className={styles.primaryAction} disabled={busy} onClick={() => setMyStatus('on_site', myLive?.job_id)}>
                  📍 Servisteyim
                </button>
              )}

              {myState === 'on_site' && (
                <button className={styles.primaryAction} disabled={busy} onClick={() => setMyStatus('available')}>
                  ✓ Müsaitim
                </button>
              )}

              {message && <p className={styles.message}>{message}</p>}
            </>
          ) : (
            <div className={styles.list}>
              {rows.length === 0 ? <p className={styles.empty}>Aktif servis personeli yok.</p> : rows.map(row => (
                <div className={styles.row} key={row.person.id}>
                  <span className={`${styles.dot} ${styles[row.state]}`} />
                  <div>
                    <b>{row.person.full_name}</b>
                    <small>{row.activeJob ? `${row.activeJob.customer_name}${row.activeJob.service_no ? ` · ${row.activeJob.service_no}` : ''}` : 'Aktif servis işi yok'}</small>
                  </div>
                  <span className={`${styles.pill} ${styles[row.state]}`}>{stateLabel(row.state)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
