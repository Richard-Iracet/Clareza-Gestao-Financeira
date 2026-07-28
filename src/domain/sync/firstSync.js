import { checksum } from '../../utils/snapshot.js'

export const selectBootstrapLocalData = ({ currentData, pendingData, hasLocalState }) => (
  hasLocalState || !pendingData ? currentData : pendingData
)

export const resolveFirstSync = (localSnapshot, remoteState, options = {}) => {
  if (!remoteState) return { action: 'confirm-upload-local', localSnapshot }
  if (options.hasLocalState === false) return { action: 'hydrate-remote', remote: remoteState }
  if (checksum(localSnapshot.data) === checksum(remoteState.snapshot.data)) {
    return { action: 'synchronized', remote: remoteState }
  }
  return { action: 'conflict', localSnapshot, remote: remoteState }
}
