import { useState, useCallback } from 'react';

export function useModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState(null);

  const open = useCallback((d = null) => { setData(d); setIsOpen(true); }, []);
  const close = useCallback(() => { setIsOpen(false); setData(null); }, []);

  return { isOpen, data, open, close };
}
