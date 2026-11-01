// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FolderNameFields } from './FolderNameFields'

function Harness({ initiallyExpanded = false }: { initiallyExpanded?: boolean }) {
  const [name, setName] = useState('牛乳（通常表記）')
  const [reading, setReading] = useState(initiallyExpanded ? 'ぎゅうにゅう' : '')
  const [expanded, setExpanded] = useState(initiallyExpanded)
  return (
    <FolderNameFields
      name={name}
      reading={reading}
      readingExpanded={expanded}
      disabled={false}
      onNameChange={setName}
      onReadingChange={setReading}
      onReadingExpandedChange={setExpanded}
      actions={
        <div>
          <button type="submit">保存</button>
          <button type="button">取消</button>
        </div>
      }
    />
  )
}

describe('FolderNameFields', () => {
  afterEach(cleanup)

  it('shows only the folder name until the reading field is requested', () => {
    const { container } = render(<Harness />)
    expect(screen.getByRole('textbox', { name: 'フォルダ名' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '読み仮名（任意）' })).toBeNull()
    expect(container.querySelector('input[aria-label="フォルダ名"]')?.className).toContain(
      'w-full',
    )
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '＋ 読み仮名を追加' }))
    expect(screen.getByRole('textbox', { name: '読み仮名（任意）' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '＋ 読み仮名を追加' })).toBeNull()
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()
    const readingInput = screen.getByRole('textbox', {
      name: '読み仮名（任意）',
    }) as HTMLInputElement
    expect(readingInput.className).toContain('pr-9')
    expect(readingInput.className).toContain('min-w-0')
    expect(screen.queryByRole('button', { name: '読み仮名をクリア' })).toBeNull()
  })

  it('keeps the two-row layout height stable when toggling the reading field', () => {
    const { container } = render(<Harness />)
    const layoutRows = () =>
      container.querySelectorAll(':scope > div > div.min-h-\\[2\\.125rem\\]')
    expect(layoutRows()).toHaveLength(1)
    const collapsedHeight = layoutRows()[0]?.getBoundingClientRect().height ?? 0
    fireEvent.click(screen.getByRole('button', { name: '＋ 読み仮名を追加' }))
    expect(layoutRows()).toHaveLength(1)
    const expandedHeight = layoutRows()[0]?.getBoundingClientRect().height ?? 0
    expect(expandedHeight).toBe(collapsedHeight)
  })

  it('clears reading with × while keeping the field open and hides × when empty', () => {
    render(<Harness initiallyExpanded />)
    const readingInput = screen.getByRole('textbox', {
      name: '読み仮名（任意）',
    }) as HTMLInputElement
    expect(readingInput.value).toBe('ぎゅうにゅう')
    fireEvent.click(screen.getByRole('button', { name: '読み仮名をクリア' }))
    expect(readingInput.value).toBe('')
    expect(screen.queryByRole('button', { name: '読み仮名をクリア' })).toBeNull()
    expect(screen.getByRole('textbox', { name: '読み仮名（任意）' })).toBeTruthy()
    fireEvent.change(readingInput, { target: { value: 'みるく' } })
    expect(readingInput.value).toBe('みるく')
    expect(screen.getByRole('button', { name: '読み仮名をクリア' })).toBeTruthy()
  })

  it('restores the reading from before edit when cancel is invoked without saving', () => {
    const readingAtEditStart = 'ぎゅうにゅう'

    function HarnessWithCancel() {
      const [name, setName] = useState('牛乳（通常表記）')
      const [reading, setReading] = useState(readingAtEditStart)
      const [expanded, setExpanded] = useState(true)
      return (
        <FolderNameFields
          name={name}
          reading={reading}
          readingExpanded={expanded}
          disabled={false}
          onNameChange={setName}
          onReadingChange={setReading}
          onReadingExpandedChange={setExpanded}
          actions={
            <button type="button" onClick={() => setReading(readingAtEditStart)}>
              取消
            </button>
          }
        />
      )
    }

    render(<HarnessWithCancel />)
    const readingInput = screen.getByRole('textbox', {
      name: '読み仮名（任意）',
    }) as HTMLInputElement
    fireEvent.change(readingInput, { target: { value: 'へんこう' } })
    fireEvent.click(screen.getByRole('button', { name: '読み仮名をクリア' }))
    expect(readingInput.value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(readingInput.value).toBe(readingAtEditStart)
  })
})
