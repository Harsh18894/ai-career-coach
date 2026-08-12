import React from 'react';
import { BRAND } from '@/lib/brand';
import { LandingSections } from '@/components/landing/LandingSections';
import { HomeExperience } from '@/components/HomeExperience';

/* =====================================================================================
 * The home page — and, once someone starts, the product itself. There is no /coach route.
 *
 * This file stays a SERVER component on purpose. <LandingSections /> is rendered here, on the
 * server, and handed to the client HomeExperience as a prop; React renders a server node passed
 * to a client component as-is, so the fold's HTML is still in the initial payload. Making this
 * whole page client-side would have cost the static render and the LCP work in Pass B.
 * ===================================================================================== */

export const metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description,
};

export default function HomePage() {
  return <HomeExperience landing={<LandingSections />} />;
}
