// Team room dialog (FR-8.1): create a room and share its code, or join one with a code. Joining takes 3 clicks
// (Join Room → type the code → Join). The room itself lives in src/net/rooms.ts (Supabase Realtime Presence).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_PLAYERS, ROOM_CODE_LENGTH, hasStarted, normalizeRoomCode } from '../../net/rooms'
import { RolePicker } from './RolePicker'
import { roomClient } from '../../net/roomClient'

export type RoomMode = 'create' | 'join'

export function RoomLobby({
  mode,
  onClose,
  onStarted,
}: {
  mode: RoomMode
  onClose: () => void
  /** The host started the team design (FR-8.2: every role assigned): close without leaving the room. */
  onStarted: () => void
}) {
  const { t } = useTranslation()
  const room = useSyncExternalStore(roomClient.subscribe, roomClient.getState)
  const [name, setName] = useState(() => t('rooms.defaultName', { tag: room.selfId.slice(0, 3).toUpperCase() }))
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

  const close = () => {
    roomClient.leave()
    onClose()
  }
  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      roomClient.leave()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // When the host starts, everyone moves on to the design together
  const started = room.status === 'joined' && hasStarted(room.players)
  useEffect(() => {
    if (started) onStarted()
  }, [started, onStarted])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'create') roomClient.create(name)
    else roomClient.join(code, name)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code ?? '')
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const inRoom = room.status === 'joined'
  const busy = room.status === 'connecting'
  const problem =
    room.status === 'full' || room.status === 'notFound' || room.status === 'error' || room.status === 'offline'

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-outline/80 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-heading"
        className="pixel-panel max-h-full w-full max-w-2xl overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="room-heading" className="text-base">
          {inRoom ? t('rooms.lobbyHeading') : t(`rooms.heading.${mode}`)}
        </h2>

        {!inRoom && (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3 text-[10px]">
            {mode === 'join' && (
              <label className="flex flex-col gap-1">
                <span className="uppercase text-metal-light">{t('rooms.codeLabel')}</span>
                <input
                  ref={firstRef}
                  value={code}
                  onChange={(e) => setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH))}
                  maxLength={ROOM_CODE_LENGTH + 2}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="room-code-hint"
                  className="border-2 border-metal-light bg-outline px-3 py-2 text-center text-lg tracking-[0.4em] uppercase"
                />
                <span id="room-code-hint" className="text-metal-light">
                  {t('rooms.codeHint', { n: ROOM_CODE_LENGTH })}
                </span>
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="uppercase text-metal-light">{t('rooms.nameLabel')}</span>
              <input
                ref={mode === 'create' ? firstRef : undefined}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 20))}
                maxLength={20}
                className="border-2 border-metal-light bg-outline px-3 py-2"
              />
            </label>
            {problem && (
              <p role="alert" className="text-warning">
                <span aria-hidden="true">▲ </span>
                {t(`rooms.status.${room.status}`)}
              </p>
            )}
            {busy && (
              <p aria-live="polite" className="text-metal-light">
                {t('rooms.status.connecting')}
              </p>
            )}
            <div className="mt-2 flex justify-between gap-3">
              <button type="button" onClick={close} className="pixel-button px-4 py-2 text-[10px]">
                {t('rooms.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy || (mode === 'join' && code.length !== ROOM_CODE_LENGTH)}
                className="pixel-button border-shine! bg-screen! px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t(`rooms.submit.${mode}`)}
              </button>
            </div>
          </form>
        )}

        {inRoom && (
          <div className="mt-4 flex flex-col gap-4 text-[10px]">
            <div className="flex flex-col items-center gap-2">
              <span className="uppercase text-metal-light">{t('rooms.shareCode')}</span>
              <span className="border-2 border-shine px-4 py-2 text-2xl tracking-[0.3em] text-shine">{room.code}</span>
              <button type="button" onClick={() => void copy()} className="pixel-button px-3 py-1 text-[10px]">
                {copied ? t('rooms.copied') : t('rooms.copy')}
              </button>
            </div>
            <div>
              <p className="uppercase text-metal-light">
                {t('rooms.players', { n: room.players.length, max: MAX_PLAYERS })}
              </p>
              <ol aria-live="polite" className="mt-2 space-y-1">
                {room.players.map((p, i) => (
                  <li key={p.id} className="flex justify-between border-b border-metal py-1">
                    <span>
                      {i + 1}. {p.name}
                    </span>
                    <span className="text-metal-light">
                      {[i === 0 ? t('rooms.host') : '', p.id === room.selfId ? t('rooms.you') : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <RolePicker />
            <div className="flex justify-end">
              <button type="button" onClick={close} className="pixel-button px-4 py-2 text-[10px]">
                {t('rooms.leave')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
