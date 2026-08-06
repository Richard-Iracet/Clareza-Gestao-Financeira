import { Navigate } from 'react-router-dom'
import { FEATURE_FLAGS, isFeatureEnabled } from '../../config/featureFlags.js'
export default function ReconciliationFeatureGuard({ children }) { return isFeatureEnabled(FEATURE_FLAGS.reconciliationEngine) && isFeatureEnabled(FEATURE_FLAGS.reconciliationReview) ? children : <Navigate to="/" replace /> }
