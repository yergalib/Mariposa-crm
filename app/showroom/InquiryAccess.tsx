"use client";
import { createContext, useContext, type ReactNode } from 'react';
import { PUBLIC_INQUIRY_INTAKE_OPEN } from '@/lib/showroom/release';
const InquiryAccess = createContext(false);
export function InquiryAccessProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <InquiryAccess.Provider value={enabled}>{children}</InquiryAccess.Provider>;
}
// Presentation only. Every write reauthorizes independently on the server.
export function useInquiryIntake() { return useContext(InquiryAccess) || PUBLIC_INQUIRY_INTAKE_OPEN; }
