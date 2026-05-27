import { useEffect, useRef } from "react";

export function useAutosave<T>(value: T, save: (value: T) => void, delayMs = 1000) {
  const firstRun = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const handle = setTimeout(() => saveRef.current(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
}
