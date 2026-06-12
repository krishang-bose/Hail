import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const categoryColors: Record<string, string> = {
  founder:   '#A07040',
  cto:       '#7A7040',
  engineer:  '#407A70',
  recruiter: '#7A407A',
  company:   '#4A3B2C',
};

export const categoryLabels: Record<string, string> = {
  founder: 'Founder',
  cto: 'CTO / VP Eng',
  engineer: 'Engineering',
  recruiter: 'Recruiting',
};
