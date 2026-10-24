import { Navigate, createHashRouter } from 'react-router-dom'
import { Shell } from '@v2/Shell'
import { TodayScreen } from '@v2/screens/TodayScreen'
import { SessionScreen } from '@v2/screens/SessionScreen'
import { ResultScreen } from '@v2/screens/ResultScreen'
import { ReviewScreen } from '@v2/screens/ReviewScreen'
import { ListScreen } from '@v2/screens/ListScreen'
import { SettingsScreen } from '@v2/screens/SettingsScreen'

// Hash routing works on static hosts, sub-paths and previews without a 404 fallback.
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <TodayScreen /> },
      { path: 'learn', element: <Navigate to="/" replace /> },
      { path: 'learn/session', element: <SessionScreen /> },
      { path: 'learn/result', element: <ResultScreen /> },
      { path: 'learn/review', element: <ReviewScreen /> },
      { path: 'list', element: <ListScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
