//go:build windows

package system

import (
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

type processSample struct {
	cpuTime  time.Duration
	rssBytes uint64
}

type processMemoryCounters struct {
	cb                         uint32
	pageFaultCount             uint32
	peakWorkingSetSize         uintptr
	workingSetSize             uintptr
	quotaPeakPagedPoolUsage    uintptr
	quotaPagedPoolUsage        uintptr
	quotaPeakNonPagedPoolUsage uintptr
	quotaNonPagedPoolUsage     uintptr
	pagefileUsage              uintptr
	peakPagefileUsage          uintptr
}

var (
	psapiDLL             = syscall.NewLazyDLL("psapi.dll")
	getProcessMemoryInfo = psapiDLL.NewProc("GetProcessMemoryInfo")
)

func readProcessSample() (processSample, error) {
	handle := windows.CurrentProcess()

	var creation, exit, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &creation, &exit, &kernel, &user); err != nil {
		return processSample{}, err
	}

	counters := processMemoryCounters{cb: uint32(unsafe.Sizeof(processMemoryCounters{}))}
	r1, _, callErr := getProcessMemoryInfo.Call(
		uintptr(handle),
		uintptr(unsafe.Pointer(&counters)),
		uintptr(counters.cb),
	)
	if r1 == 0 {
		return processSample{}, callErr
	}

	return processSample{
		cpuTime:  time.Duration(kernel.Nanoseconds() + user.Nanoseconds()),
		rssBytes: uint64(counters.workingSetSize),
	}, nil
}
