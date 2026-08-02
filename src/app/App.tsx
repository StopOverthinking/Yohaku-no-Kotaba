import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AppProviders } from '@/app/providers'
import { ScreenFrame } from '@/components/ScreenFrame'
import { useShouldReduceEffects } from '@/lib/useShouldReduceEffects'

type TransitionPhase = 'enter' | 'idle' | 'exit'

function getRouteSignature(location: ReturnType<typeof useLocation>) {
  return `${location.pathname}${location.search}${location.hash}`
}

function isListRoute(location: ReturnType<typeof useLocation>) {
  return location.pathname === '/list'
}

export function App() {
  const location = useLocation()
  const outlet = useOutlet()
  const shouldReduceEffects = useShouldReduceEffects()
  const pendingRouteRef = useRef({ location, outlet })
  const bypassedRouteSignatureRef = useRef<string | null>(null)
  const [displayLocation, setDisplayLocation] = useState(location)
  const [displayOutlet, setDisplayOutlet] = useState(outlet)
  const [phase, setPhase] = useState<TransitionPhase>('enter')
  const currentSignature = getRouteSignature(location)
  const displaySignature = getRouteSignature(displayLocation)
  const listRouteInvolved = isListRoute(location) || isListRoute(displayLocation)
  const shouldBypassTransition =
    shouldReduceEffects ||
    listRouteInvolved ||
    (bypassedRouteSignatureRef.current === currentSignature && currentSignature === displaySignature)

  useEffect(() => {
    pendingRouteRef.current = { location, outlet }

    if (listRouteInvolved) {
      bypassedRouteSignatureRef.current = currentSignature
    }

    if (shouldBypassTransition) {
      setDisplayLocation(location)
      setDisplayOutlet(outlet)
      setPhase('idle')
      return
    }

    if (currentSignature !== displaySignature) {
      setPhase('exit')
    }
  }, [currentSignature, displaySignature, listRouteInvolved, location, outlet, shouldBypassTransition])

  return (
    <AppProviders>
      <div className="app-shell">
        <ScreenFrame>
          {shouldBypassTransition ? (
            <div className="page-shell">{outlet}</div>
          ) : (
            <motion.div
              key={displaySignature}
              className="page-shell"
              initial={{ opacity: 0, y: 10 }}
              animate={phase === 'exit' ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
              transition={{ duration: phase === 'exit' ? 0.14 : 0.18, ease: 'easeOut' }}
              onAnimationComplete={() => {
                if (phase === 'exit') {
                  const pendingRoute = pendingRouteRef.current
                  setDisplayLocation(pendingRoute.location)
                  setDisplayOutlet(pendingRoute.outlet)
                  setPhase('enter')
                  return
                }

                if (phase === 'enter') {
                  setPhase('idle')
                }
              }}
            >
              {displayOutlet}
            </motion.div>
          )}
        </ScreenFrame>
      </div>
    </AppProviders>
  )
}
