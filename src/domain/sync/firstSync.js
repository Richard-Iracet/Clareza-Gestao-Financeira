import { checksum } from '../../utils/snapshot.js'

export const resolveFirstSync = (localSnapshot, remoteState) => {
  if (!remoteState) return { action: 'confirm-upload-local', localSnapshot }
  if (checksum(localSnapshot.data) === checksum(remoteState.snapshot.data)) {
    return { action: 'synchronized', remote: remoteState }
  }
  return { action: 'conflict', localSnapshot, remote: remoteState }
}
