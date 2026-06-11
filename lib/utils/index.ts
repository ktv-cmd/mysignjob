import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

export function formatInches(inches: number): string {
  const feet = Math.floor(inches / 12)
  const remainingInches = inches % 12
  if (feet === 0) return `${remainingInches}"`
  if (remainingInches === 0) return `${feet}'`
  return `${feet}' ${remainingInches}"`
}

export function formatDimensions(widthIn: number, heightIn: number): string {
  return `${formatInches(widthIn)} × ${formatInches(heightIn)}`
}

// Resize and compress image for AI calls
export async function resizeImageForAI(
  file: File,
  maxWidth = 1920,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement("canvas")

      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext("2d")!
      // Fix EXIF orientation by drawing normally (browser handles EXIF in img.onload)
      ctx.drawImage(img, 0, 0, width, height)

      resolve(canvas.toDataURL("image/jpeg", quality))
    }

    img.onerror = reject
    // Setting src after onload to ensure EXIF orientation is applied by browser
    img.src = url
  })
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Commission math
export function calculateSCDeposit(totalCents: number, commissionRate: number): number {
  // SC gets 25% of their share at kickoff by default
  // SC's total share = (100 - commission_rate)%
  // SC kickoff portion = half of their total share
  const scTotalRate = (100 - commissionRate) / 100
  return Math.round((totalCents * 0.5) * scTotalRate)
}

export function calculateSCFinal(totalCents: number, commissionRate: number): number {
  const scTotalRate = (100 - commissionRate) / 100
  const scTotal = Math.round(totalCents * scTotalRate)
  const scDeposit = calculateSCDeposit(totalCents, commissionRate)
  return scTotal - scDeposit
}
