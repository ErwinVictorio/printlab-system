const photo = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=82`

export const events = [
  { slug: 'metro-fun-run', title: 'Metro Fun Run', category: 'Fun Run', date: '2026-10-25', location: 'Metro Manila', cover: photo('photo-1452626038306-9aae5e071dd3'), description: 'Find your race-day moments, from the starting line to the finish.' },
  { slug: 'city-music-fest', title: 'City Music Fest', category: 'Photoman', date: '2026-11-10', location: 'Quezon City', cover: photo('photo-1501386761578-eac5c94b800a'), description: 'Revisit a night of live music, bright lights, and big crowds.' },
  { slug: 'company-anniversary', title: 'Company Anniversary', category: 'Photobooth', date: '2026-11-15', location: 'Makati City', cover: photo('photo-1511795409834-ef04bbd61622'), description: 'Browse the portraits and candid highlights from the celebration.' },
]

const racePhotos = ['photo-1552674605-db6ffd4facb5', 'photo-1530143311094-34d807799e8f', 'photo-1452626038306-9aae5e071dd3']
export const media = events.flatMap((event) => (
  event.category === 'Fun Run' ? racePhotos : [null]
).map((image, index) => ({
  id: `${event.slug}-${index + 1}`,
  event: event.slug,
  name: `Photo ${index + 1}`,
  image: image ? photo(image) : event.cover,
  bib: event.category === 'Fun Run' ? ['1024', '1187', '1305'][index] : null,
  price: 5000,
})))

export const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
export const dateLabel = (date) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(date))
