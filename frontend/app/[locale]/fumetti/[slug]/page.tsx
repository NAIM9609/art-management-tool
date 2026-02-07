import FumettoDetailClient from './FumettoDetailClient';

// Required for static export: pre-render a placeholder slug page.
// The actual slug is read client-side via useParams().
export function generateStaticParams() {
  return [{ slug: '_' }];
}

export default function FumettoDetailPage() {
  return <FumettoDetailClient />;
}

