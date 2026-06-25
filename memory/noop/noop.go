package noop

import (
	"context"

	"xbot/memory"
)

// NoOpMemory is a no-op memory provider.
// It satisfies the MemoryProvider interface but performs no actual work:
// no LLM calls, no file I/O, no persistence.
// Used when memory_provider is set to "none" to disable memory entirely.
type NoOpMemory struct{}

var _ memory.MemoryProvider = (*NoOpMemory)(nil)

// New creates a new NoOpMemory instance.
func New() *NoOpMemory {
	return &NoOpMemory{}
}

// Recall returns empty string — no memory to inject.
func (m *NoOpMemory) Recall(_ context.Context, _ string) (string, error) {
	return "", nil
}

// Memorize returns success without performing any work.
// The NewLastConsolidated is set to len(messages) so the caller treats all
// messages as already consolidated, avoiding repeated invocations.
func (m *NoOpMemory) Memorize(_ context.Context, input memory.MemorizeInput) (memory.MemorizeResult, error) {
	return memory.MemorizeResult{
		NewLastConsolidated: len(input.Messages),
		OK:                  true,
	}, nil
}

// Close is a no-op.
func (m *NoOpMemory) Close() error {
	return nil
}
