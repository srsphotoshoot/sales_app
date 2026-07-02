import React, { useState, useEffect } from 'react';
import { fetchImageBlobUrl } from '../services/api';

const AuthImage = ({ src, alt, style, fallback = null }) => {
  const [resolvedSrc, setResolvedSrc] = useState(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    if (!src.startsWith('http')) {
      setResolvedSrc(src);
      return;
    }
    setResolvedSrc(null);
    setErrored(false);
    fetchImageBlobUrl(src).then(url => {
      if (!cancelled) {
        if (url) setResolvedSrc(url);
        else setErrored(true);
      }
    });
    return () => { cancelled = true; };
  }, [src]);

  if (errored || !src) return fallback;
  if (!resolvedSrc) return fallback;
  return <img src={resolvedSrc} alt={alt || ''} style={style} />;
};

export default AuthImage;
