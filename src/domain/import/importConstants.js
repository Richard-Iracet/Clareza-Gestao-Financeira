export const IMPORT_PARSER_VERSION = 1
export const IMPORT_NORMALIZATION_VERSION = 1
export const IMPORT_LIMITS = Object.freeze({ maxFileBytes: 5 * 1024 * 1024, maxRecords: 20000, previewRows: 8, maxFieldLength: 4000 })
export const BATCH_STATUSES = Object.freeze(['uploaded','parsing','awaiting_mapping','awaiting_review','confirmed','partially_confirmed','rejected','failed','cancelled'])
export const REVIEW_STATUSES = Object.freeze(['new','exact_duplicate','possible_duplicate','updated','invalid','suspicious','accepted','ignored'])
export const CSV_FIELDS = Object.freeze(['description','date','amount','debit','credit','currency','externalId','balance','originalCategory','status','notes'])
export const IMPORT_ERROR = Object.freeze({ EMPTY_FILE: 'EMPTY_FILE', FILE_TOO_LARGE: 'FILE_TOO_LARGE', INVALID_EXTENSION: 'INVALID_EXTENSION', CONTENT_MISMATCH: 'CONTENT_MISMATCH', TOO_MANY_RECORDS: 'TOO_MANY_RECORDS', INVALID_AMOUNT: 'INVALID_AMOUNT', AMBIGUOUS_AMOUNT: 'AMBIGUOUS_AMOUNT', INVALID_DATE: 'INVALID_DATE', MISSING_MAPPING: 'MISSING_MAPPING', FEATURE_DISABLED: 'FEATURE_DISABLED' })
