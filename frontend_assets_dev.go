//go:build !release

package clusterwatchlocal

import "io/fs"

func EmbeddedFrontend() (fs.FS, bool, error) {
	return nil, false, nil
}
