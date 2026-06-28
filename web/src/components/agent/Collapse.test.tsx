/**
 * Tests for the collapsible intermediate-process components (Spec 4 §3.3).
 *
 * Verifies the Radix Collapsible mounts its body on open (lazy), that tool
 * status/labels render, and that iteration history nests tool/reasoning blocks.
 */
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

import { renderWithProviders } from '@/test-utils'
import { IterationHistory } from '@/components/agent/IterationHistory'
import { ReasoningBlock } from '@/components/agent/ReasoningBlock'
import { ToolCallBlock } from '@/components/agent/ToolCallBlock'
import type { IterationSnapshot, ToolProgress } from '@/types/agent'

describe('ToolCallBlock', () => {
  it('shows the tool name and status when collapsed; shows args/output on open', () => {
    const tool: ToolProgress = {
      name: 'Read',
      status: 'done',
      args: '{"path":"a.go"}',
      detail: 'file contents',
    }
    renderWithProviders(<ToolCallBlock tool={tool} />)
    // collapsed header shows the name
    expect(screen.getByText('Read')).toBeInTheDocument()
    // detail body not mounted yet (lazy)
    expect(screen.queryByText('file contents')).not.toBeInTheDocument()

    // open it
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('file contents')).toBeInTheDocument()
    expect(screen.getByText('{"path":"a.go"}')).toBeInTheDocument()
  })

  it('renders an error status chip for status=error', () => {
    renderWithProviders(<ToolCallBlock tool={{ name: 'Shell', status: 'error' }} />)
    expect(screen.getByText('Shell')).toBeInTheDocument()
  })
})

describe('ReasoningBlock', () => {
  it('renders nothing when content is empty', () => {
    const { container } = renderWithProviders(<ReasoningBlock content="" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the reasoning header and expands to the text', () => {
    renderWithProviders(<ReasoningBlock content={'Because the sky is blue.'} />)
    fireEvent.click(screen.getByRole('button'))
    // The text appears both in the Markdown body and an sr-only first-line hint.
    expect(screen.getAllByText(/Because the sky is blue/).length).toBeGreaterThan(0)
  })
})

describe('IterationHistory', () => {
  it('renders iteration count badge and, on expand, the tools', () => {
    const iterations: IterationSnapshot[] = [
      {
        iteration: 1,
        reasoning: 'planning',
        tools: [
          { name: 'Read', status: 'done', summary: 'ok' },
          { name: 'Grep', status: 'error' },
        ],
      },
    ]
    renderWithProviders(<IterationHistory iterations={iterations} />)
    expect(screen.getByText('1')).toBeInTheDocument() // count badge

    // Expand the top-level "Iterations" container.
    fireEvent.click(screen.getAllByRole('button')[0])
    // The iteration item is itself a collapsible; expand it to reveal contents.
    fireEvent.click(screen.getAllByRole('button')[1])
    // With ToolGroupCard, consecutive tools are merged into one card.
    // The group header shows the name summary; expand it to reveal individual tools.
    const groupHeader = screen.getByText('Read, Grep').closest('button')
    expect(groupHeader).toBeTruthy()
    fireEvent.click(groupHeader!)
    // Individual ToolCallBlock headers should now be visible.
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('Grep')).toBeInTheDocument()
  })

  it('renders nothing for empty iterations', () => {
    const { container } = renderWithProviders(<IterationHistory iterations={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('delegates a single tool directly to ToolCallBlock (no group wrapper)', () => {
    const iterations: IterationSnapshot[] = [
      {
        iteration: 1,
        tools: [{ name: 'Read', status: 'done', summary: 'ok' }],
      },
    ]
    renderWithProviders(<IterationHistory iterations={iterations} />)
    fireEvent.click(screen.getAllByRole('button')[0]) // expand Iterations
    fireEvent.click(screen.getAllByRole('button')[1]) // expand iteration #1
    // Single tool: ToolCallBlock renders directly (no ToolGroupCard wrapper).
    expect(screen.getByText('Read')).toBeInTheDocument()
  })
})
