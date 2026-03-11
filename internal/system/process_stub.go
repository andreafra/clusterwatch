//go:build !windows

package system

import "time"

type processSample struct {
	cpuTime  time.Duration
	rssBytes uint64
}

func readProcessSample() (processSample, error) {
	return processSample{}, nil
}
