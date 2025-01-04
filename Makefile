PLUGIN_ID=obsidian-image-uploader-api
BUILD_FILES=main.js manifest.json styles.css

# Include local environment variables
-include .env.local

# Set plugin directory
PLUGIN_DIR=$(VAULT_PATH)/.obsidian/plugins/$(PLUGIN_ID)

# Detect OS for install command
ifeq ($(OS),Windows_NT)
    INSTALL_CMD=xcopy /Y
    INSTALL_FLAGS=
else
    UNAME_S:=$(shell uname -s)
    ifeq ($(UNAME_S),Darwin)
        INSTALL_CMD=install
        INSTALL_FLAGS=-m 644
    else
        INSTALL_CMD=install
        INSTALL_FLAGS=-m 644
    endif
endif

.PHONY: build install clean

# Build plugin
build:
	npm run build

# Install plugin to Obsidian vault
install: build
	@if [ -z "$(VAULT_PATH)" ]; then \
		echo "Error: VAULT_PATH is not set. Copy .env.local.example to .env.local and set your vault path"; \
		exit 1; \
	fi
	mkdir -p "$(PLUGIN_DIR)"
ifeq ($(OS),Windows_NT)
	$(INSTALL_CMD) $(BUILD_FILES) "$(PLUGIN_DIR)\"
else
	$(INSTALL_CMD) $(INSTALL_FLAGS) $(BUILD_FILES) "$(PLUGIN_DIR)"
endif
	@echo "Plugin installed to $(PLUGIN_DIR)"
	@echo "Please restart Obsidian to apply changes"

# Clean build files
clean:
	rm -f main.js
	rm -rf .obsidian-plugin 