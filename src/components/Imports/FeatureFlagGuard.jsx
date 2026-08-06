import { Navigate } from 'react-router-dom'
import { FEATURE_FLAGS, isFeatureEnabled } from '../../config/featureFlags.js'
export default function FeatureFlagGuard({ children }) { return isFeatureEnabled(FEATURE_FLAGS.ofxCsvImport) ? children : <Navigate to="/" replace /> }
