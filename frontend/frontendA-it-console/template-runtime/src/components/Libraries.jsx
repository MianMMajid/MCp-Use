import Image from 'next/image'

import { Heading } from '@/components/Heading'
import logoGo from '@/images/logos/go.svg'
import logoNode from '@/images/logos/node.svg'
import logoPhp from '@/images/logos/php.svg'
import logoPython from '@/images/logos/python.svg'
import logoRuby from '@/images/logos/ruby.svg'

const libraries = [
  {
    name: 'PHP',
    description:
      'A popular general-purpose scripting language that is especially suited to web development.',
    logo: logoPhp,
  },
  {
    name: 'Ruby',
    description:
      'A dynamic, open source programming language with a focus on simplicity and productivity.',
    logo: logoRuby,
  },
  {
    name: 'Node.js',
    description:
      'Node.js® is an open-source, cross-platform JavaScript runtime environment.',
    logo: logoNode,
  },
  {
    name: 'Python',
    description:
      'Python is a programming language that lets you work quickly and integrate systems more effectively.',
    logo: logoPython,
  },
  {
    name: 'Go',
    description:
      'An open-source programming language supported by Google with built-in concurrency.',
    logo: logoGo,
  },
]

export function Libraries() {
  return (
    <div className="my-16 xl:max-w-none">
      <Heading level={2} id="official-libraries">
        Official libraries
      </Heading>
      <div className="not-prose mt-4 grid grid-cols-1 gap-x-6 gap-y-10 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:max-w-none xl:grid-cols-3 dark:border-white/5">
        {libraries.map((library) => (
          <div key={library.name} className="flex flex-row-reverse gap-6">
            <div className="flex-auto">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                {library.name}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {library.description}
              </p>
              <p className="mt-4">
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  Coming Soon
                </span>
              </p>
            </div>
            <Image
              src={library.logo}
              alt=""
              className="h-12 w-12"
              unoptimized
            />
          </div>
        ))}
      </div>
    </div>
  )
}
