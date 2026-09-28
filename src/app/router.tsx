import { Navigate, createBrowserRouter } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { App } from '@/app/App'
import { ConjugationResultPage } from '@/features/conjugation/ConjugationResultPage'
import { ConjugationSessionPage } from '@/features/conjugation/ConjugationSessionPage'
import { ConjugationSetupPage } from '@/features/conjugation/ConjugationSetupPage'
import { ExamResultPage } from '@/features/exam/ExamResultPage'
import { ExamSessionPage } from '@/features/exam/ExamSessionPage'
import { ExamSetupPage } from '@/features/exam/ExamSetupPage'
import { GameResultPage } from '@/features/game/GameResultPage'
import { GameSessionPage } from '@/features/game/GameSessionPage'
import { GameSetupPage } from '@/features/game/GameSetupPage'
import { HomePage } from '@/features/home/HomePage'
import { LearnResultPage } from '@/features/learn/LearnResultPage'
import { LearnSessionPage } from '@/features/learn/LearnSessionPage'
import { LearnSetupPage } from '@/features/learn/LearnSetupPage'
import { ListPage } from '@/features/list/ListPage'

const EditorScreen = lazy(() => import('@/features/editor/EditorScreen').then((module) => ({ default: module.EditorScreen })))

export const router = createBrowserRouter(
  [
    {
      path: '/editor',
      element: <Suspense fallback={null}><EditorScreen /></Suspense>,
    },
    {
      path: '/',
      element: <App />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'list', element: <ListPage /> },
        { path: 'learn', element: <LearnSetupPage /> },
        { path: 'learn/session', element: <LearnSessionPage /> },
        { path: 'learn/result', element: <LearnResultPage /> },
        { path: 'conjugation', element: <ConjugationSetupPage /> },
        { path: 'conjugation/session', element: <ConjugationSessionPage /> },
        { path: 'conjugation/result', element: <ConjugationResultPage /> },
        { path: 'exam', element: <ExamSetupPage /> },
        { path: 'exam/session', element: <ExamSessionPage /> },
        { path: 'exam/result', element: <ExamResultPage /> },
        { path: 'game', element: <GameSetupPage /> },
        { path: 'game/session', element: <GameSessionPage /> },
        { path: 'game/result', element: <GameResultPage /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  },
)
