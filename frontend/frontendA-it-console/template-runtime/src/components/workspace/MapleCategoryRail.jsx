'use client'

import clsx from 'clsx'

export function MapleCategoryRail({ categories, activeCategory, onSelectCategory }) {
  return (
    <nav className="mw-category-rail" aria-label="Mayple workspace categories">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={clsx(
            'mw-category-pill',
            category.id === activeCategory && 'mw-category-pill-active',
          )}
          onClick={() => onSelectCategory(category.id)}
          aria-pressed={category.id === activeCategory}
        >
          <span className="mw-category-title">{category.label}</span>
          <span className="mw-category-description">{category.description}</span>
        </button>
      ))}
    </nav>
  )
}
