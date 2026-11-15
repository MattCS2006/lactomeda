// Role selection in the team room (FR-8.2): one card per seat (roles merge for 2–3 players), who holds it and a
// button to take a free one. Everyone always has a seat, so every role is assigned; the host starts the design.
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { allRolesAssigned, assignRoles } from '../../net/roles'
import { roomClient } from '../../net/roomClient'

export function RolePicker() {
  const { t } = useTranslation()
  const room = useSyncExternalStore(roomClient.subscribe, roomClient.getState)
  const { slots, holder } = assignRoles(room.players)
  const isHost = room.players[0]?.id === room.selfId
  const ready = allRolesAssigned(room.players)
  const name = (id: string | null) => room.players.find((p) => p.id === id)?.name ?? '—'

  return (
    <div className="flex flex-col gap-3">
      <p className="uppercase text-metal-light">{t('rooms.rolesHeading')}</p>
      {slots.length < 4 && <p className="text-metal-light">{t('rooms.merged', { n: room.players.length })}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {slots.map((slot, i) => {
          const mine = holder[i] === room.selfId
          return (
            <li
              key={slot.join('+')}
              className={`flex flex-col gap-2 border-2 p-3 ${mine ? 'border-shine bg-screen' : 'border-metal bg-outline/40'}`}
            >
              <p className="text-xs">{slot.map((r) => t(`rooms.role.${r}.name`)).join(' + ')}</p>
              <ul className="space-y-1 text-metal-light">
                {slot.map((r) => (
                  <li key={r}>{t(`rooms.role.${r}.owns`)}</li>
                ))}
              </ul>
              <p className="mt-auto flex items-center justify-between gap-2">
                <span>
                  {name(holder[i] ?? null)}
                  {mine ? ` · ${t('rooms.you')}` : ''}
                </span>
                {!mine && (
                  <button
                    type="button"
                    onClick={() => roomClient.chooseRole(slot[0]!)}
                    className="pixel-button px-2 py-1 text-[10px]"
                  >
                    {t('rooms.pick')}
                  </button>
                )}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="text-metal-light">{t('rooms.pickHint')}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className={ready ? 'text-ok' : 'text-warning'}>
          <span aria-hidden="true">{ready ? '✓ ' : '▲ '}</span>
          {ready ? (isHost ? t('rooms.readyHost') : t('rooms.waitHost')) : t('rooms.notReady')}
        </p>
        {isHost && (
          <button
            type="button"
            disabled={!ready}
            onClick={() => roomClient.start()}
            className="pixel-button border-shine! bg-screen! px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('rooms.start')} ▶
          </button>
        )}
      </div>
    </div>
  )
}
