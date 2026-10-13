import 'server-only';

import { cacheLife } from 'next/cache';

// The photo wall behind the auth pages. Unsplash's Random Photos endpoint is the only
// thing here that needs the Access Key, and it is read on the server for two reasons:
// a key in the bundle is a key given away, and the demo tier allows 50 requests an
// hour — shared across every visitor, so one call has to serve many page views.
//
// The Secret Key is deliberately absent: it exists for the OAuth token exchange, which
// this project never does. Nothing here needs it, so nothing here should be able to use
// it. Everything below authenticates with `Client-ID <access key>`.

const ENDPOINT = 'https://api.unsplash.com/photos/random';
const QUERY = 'summer';
const COUNT = 14;

// Unsplash's API guidelines require attribution with links carrying UTM parameters —
// it is how they can tell the traffic came from an app rather than from someone
// pasting an image URL. The credit line under the wall renders these.
const UTM = 'utm_source=feel-summer&utm_medium=referral';
export const UNSPLASH_URL = `https://unsplash.com/?${UTM}`;

const withUtm = url => `${url}${url.includes('?') ? '&' : '?'}${UTM}`;

// Baked from the API itself (a real response, not invented URLs) so the wall still
// renders when the key is missing, the quota is spent or the network is down. The
// photographers are listed too: a fallback showing their work without crediting them
// would be the one case where the wall is both unstyled and unattributed.
const FALLBACK = {
  photos: [
    'https://images.unsplash.com/photo-1484506097116-1bcba4fa7568?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1484821582734-6c6c9f99a672?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1496318447583-f524534e9ce1?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1501419737817-eadda6b445e3?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1545328732-fd7ea6242f4e?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1551672746-89991811c186?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1561294553-302bbcf0f4ce?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1562261150-0989084c593e?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1564132254865-639bfec4c5bf?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1564419431636-fe02f0eff7aa?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1570469104943-b3f9aa53f049?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1576643389950-64434aa6c7db?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1593185522767-a0de9f32b8e4?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1603538966022-afcc0803652e?ixid=M3wxMTAwNTY4fDB8MXxyYW5kb218fHx8fHx8fHwxNzkxODU1NTcxfA&ixlib=rb-4.1.0&w=640&q=75&auto=format&fit=crop'
  ],
  people: [
    { name: 'Jakob Owens', url: withUtm('https://unsplash.com/@jakobowens1') },
    { name: 'Ishan @seefromthesky', url: withUtm('https://unsplash.com/@seefromthesky') },
    { name: 'Kaizen Nguyễn', url: withUtm('https://unsplash.com/@kaizennguyen') },
    { name: 'elizabeth lies', url: withUtm('https://unsplash.com/@elizabethlies') },
    { name: 'Marvin Kuhn', url: withUtm('https://unsplash.com/@einstein29') },
    { name: 'Drew Dau', url: withUtm('https://unsplash.com/@daunation') },
    { name: 'Belinda Fewings', url: withUtm('https://unsplash.com/@bel2000a') },
    { name: 'Herbert Goetsch', url: withUtm('https://unsplash.com/@hg_photo') },
    { name: 'Agata Create', url: withUtm('https://unsplash.com/@agatacreate') },
    { name: 'Boxed Water Is Better', url: withUtm('https://unsplash.com/@boxedwater') },
    { name: 'Jonas Morgner', url: withUtm('https://unsplash.com/@jonasmorgner') },
    { name: 'Hussan Amir', url: withUtm('https://unsplash.com/@hussanamir') },
    { name: 'Sandy Ravaloniaina', url: withUtm('https://unsplash.com/@th3sand7') },
    { name: 'john labelette', url: withUtm('https://unsplash.com/@nopizzanocry') }
  ]
};

export const getBackdropPhotos = async () => {
  // Cached rather than fetched per request: the wall is decoration, and the endpoint
  // is metered per hour. `hours` keeps the page statically prerenderable while still
  // turning the wall over a few times a day.
  'use cache';
  cacheLife('hours');

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return FALLBACK;

  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set('count', String(COUNT));
    url.searchParams.set('query', QUERY);
    url.searchParams.set('orientation', 'landscape');

    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error(`Unsplash responded ${response.status}`);

    const photos = await response.json();
    const people = [];
    const credited = new Set();
    const images = photos.map(photo => {
      if (!credited.has(photo.user.name)) {
        credited.add(photo.user.name);
        people.push({ name: photo.user.name, url: withUtm(photo.user.links.html) });
      }
      return `${photo.urls.raw}&w=640&q=75&auto=format&fit=crop`;
    });

    return { photos: images, people };
  } catch {
    // A background is decoration. A spent quota, a rotated key or a dead network must
    // not take the login page down with it, so any failure lands on the baked set.
    return FALLBACK;
  }
};
