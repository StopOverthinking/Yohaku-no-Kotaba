import { Navigate, createBrowserRouter } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { App } from '@/app/App'
import { HomePage } from '@/features/home/HomePage'
import { LearnResultPage } from '@/features/learn/LearnResultPage'
import { ContextSessionPage } from '@/features/learn/ContextSessionPage'
import { ReviewListPage } from '@/features/learn/ReviewListPage'
import { LearnSetupPage } from '@/features/learn/LearnSetupPage'
import { ListPage } from '@/features/list/ListPage'

const EditorScreen = lazy(() =>
  import('@/features/editor/EditorScreen').then((module) => ({ default: module.EditorScreen })),
)

export const router = createBrowserRouter(
  [
    {
      path: '/editor',
      element: (
        <Suspense fallback={null}>
          <EditorScreen />
        </Suspense>
      ),
    },
    {
      path: '/',
      element: <App />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'list', element: <ListPage /> },
        { path: 'learn', element: <LearnSetupPage /> },
        { path: 'learn/session', element: <ContextSessionPage /> },
        { path: 'learn/review', element: <ReviewListPage /> },
        { path: 'learn/result', element: <LearnResultPage /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  },
)
