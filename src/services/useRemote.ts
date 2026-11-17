import { useEffect, useState } from 'react'
import { remote } from './remote'

/** Run a backend function and keep its latest result. Returns null while loading or in sample mode. */
export function useRpc<T>(fn: string, args: Record<string, unknown> | null, deps: unknown[]): T | null {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    if (!remote || !args) return setData(null)
    let live = true
    remote.rpc<T>(fn, args).then((d) => { if (live) setData(d) }).catch((e) => { console.warn(fn, e); if (live) setData(null) })
    return () => { live = false }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return data
}
