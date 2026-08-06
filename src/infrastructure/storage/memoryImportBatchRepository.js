export const createMemoryImportBatchRepository = () => {
  const batches = new Map(), records = new Map()
  return {
    async savePrepared(batch, items) { const duplicate = [...batches.values()].find((value) => value.userId === batch.userId && value.fileHash === batch.fileHash && value.statementType === batch.statementType && value.contextId === batch.contextId && value.status !== 'cancelled'); if (duplicate) return { duplicate: true, batch: duplicate }; batches.set(batch.id, structuredClone(batch)); records.set(batch.id, structuredClone(items)); return { batch, records: items } },
    async listBatches(userId) { return [...batches.values()].filter((batch) => batch.userId === userId).map(structuredClone) },
    async listRecords(userId, batchId) { const batch = batches.get(batchId); return batch?.userId === userId ? structuredClone(records.get(batchId) || []) : [] },
    async decide({ userId, recordId, decision, reviewStatus }) { for (const [batchId, items] of records) { if (batches.get(batchId)?.userId !== userId) continue; const item = items.find((value) => value.id === recordId); if (item) { item.userDecision = decision; item.reviewStatus = reviewStatus; return structuredClone(item) } } return null },
    async cancel(userId, batchId) { const batch = batches.get(batchId); if (!batch || batch.userId !== userId) return null; batch.status = 'cancelled'; return structuredClone(batch) },
    snapshot: () => ({ batches, records }),
  }
}
