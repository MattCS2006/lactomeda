// Shown on the design screens while playing in a team room (FR-8.2): the room code and the roles this player holds.
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { rolesOf } from '../../net/roles'
import { hasStarted } from '../../net/rooms'
import { roomClient } from '../../net/roomClient'

export function TeamBanner() {
  const { t } = useTranslation()
  const room = useSyncExternalStore(roomClient.subscribe, roomClient.getState)
  if (room.status !== 'joined' || !hasStarted(room.players)) return null
  const roles = rolesOf(room.selfId, room.players)
  return (
    <section
      aria-label={t('rooms.teamHeading')}
      className="pixel-panel mx-auto mb-4 flex max-w-6xl flex-wrap items-center justify-between gap-3 p-3 text-[10px]"
    >
      <p>
        <span className="uppercase text-metal-light">{t('rooms.teamHeading')} </span>
        <span className="text-shine">{room.code}</span>
        {' · '}
        {t('rooms.teamCount', { count: room.players.length })}
      </p>
      <p>
        <span className="uppercase text-metal-light">{t('rooms.yourRoles')} </span>
        {roles.map((r) => t(`rooms.role.${r}.name`)).join(' + ')}
      </p>
      <button type="button" onClick={() => roomClient.leave()} className="pixel-button px-3 py-1 text-[10px]">
        {t('rooms.leave')}
      </button>
    </section>
  )
}
