//go:build release

package clusterwatchlocal

import (
	"embed"
	"io/fs"
)

//go:embed frontend/dist
var embeddedFrontend embed.FS

func EmbeddedFrontend() (fs.FS, bool, error) {
	distFS, err := fs.Sub(embeddedFrontend, "frontend/dist")
	if err != nil {
		return nil, false, err
	}

	return distFS, true, nil
}
