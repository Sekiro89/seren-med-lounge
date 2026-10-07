'use client';

import { DeskToday } from './_components/desk-today';
import { DoctorToday } from './_components/doctor-today';
import { useStaff } from '../../../lib/staff-context';

/**
 * Today. Doctors get their clinical day (schedule ruler, agenda, patient
 * sheet, signatures); every other role keeps the desk overview.
 */
export default function TodayPage() {
  const { role } = useStaff();
  if (role === 'JUNIOR_DOCTOR' || role === 'SENIOR_DOCTOR') return <DoctorToday />;
  return <DeskToday />;
}
