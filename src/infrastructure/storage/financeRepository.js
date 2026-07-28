import { persistSnapshot, resolveSnapshot } from '../../utils/snapshot.js'

export const loadFinanceState = (backend, legacyData) => resolveSnapshot(backend, legacyData)
export const saveFinanceSnapshot = (snapshot, backend) => persistSnapshot(snapshot, backend)
