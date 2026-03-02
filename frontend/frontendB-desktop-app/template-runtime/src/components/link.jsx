import { DataInteractive } from '@headlessui/react'
import NextLink from 'next/link'
import { forwardRef } from 'react'

export const Link = forwardRef(function Link({ prefetch = true, ...props }, ref) {
  return (
    <DataInteractive>
      <NextLink prefetch={prefetch} {...props} ref={ref} />
    </DataInteractive>
  )
})
