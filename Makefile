PLUGIN_ID=obsidian-image-uploader-api
BUILD_FILES=main.js manifest.json styles.css
DEV_DATA=dev/data.json
DEV_MANIFEST=manifest-dev.json

# Include local environment variables
-include .env.local

# Set plugin directory
PLUGIN_DIR=$(VAULT_PATH)/.obsidian/plugins/$(PLUGIN_ID)
PLUGIN_DIR_DEV=$(VAULT_PATH)/.obsidian/plugins/$(PLUGIN_ID)-dev

# Detect OS for install command
ifeq ($(OS),Windows_NT)
    INSTALL_CMD=xcopy /Y
    INSTALL_FLAGS=/Y /F
    LINK_CMD=mklink
    RM_CMD=del /F /Q
    RMDIR_CMD=rmdir /S /Q
else
    UNAME_S:=$(shell uname -s)
    ifeq ($(UNAME_S),Darwin)
        INSTALL_CMD=cp
        INSTALL_FLAGS=-f
        LINK_CMD=ln -sf
        RM_CMD=rm -f
        RMDIR_CMD=rm -rf
    else
        INSTALL_CMD=cp
        INSTALL_FLAGS=-f
        LINK_CMD=ln -sf
        RM_CMD=rm -f
        RMDIR_CMD=rm -rf
    endif
endif

.PHONY: build install install-dev dev clean unlink-dev

# Build plugin
build:
	npm run build

# Development mode with hot reload
dev: unlink-dev
	@if [ -z "$(VAULT_PATH)" ]; then \
		echo "Error: VAULT_PATH is not set. Copy .env.local.example to .env.local and set your vault path"; \
		exit 1; \
	fi
	mkdir -p "$(PLUGIN_DIR_DEV)"
ifeq ($(OS),Windows_NT)
	$(LINK_CMD) "$(CURDIR)\main.js" "$(PLUGIN_DIR_DEV)\main.js"
	$(LINK_CMD) "$(CURDIR)\$(DEV_MANIFEST)" "$(PLUGIN_DIR_DEV)\manifest.json"
	$(LINK_CMD) "$(CURDIR)\styles.css" "$(PLUGIN_DIR_DEV)\styles.css" 2>/dev/null || :
	@if exist "$(CURDIR)\$(DEV_DATA)" $(LINK_CMD) "$(CURDIR)\$(DEV_DATA)" "$(PLUGIN_DIR_DEV)\data.json"
else
	$(LINK_CMD) "$(CURDIR)/main.js" "$(PLUGIN_DIR_DEV)/main.js"
	$(LINK_CMD) "$(CURDIR)/$(DEV_MANIFEST)" "$(PLUGIN_DIR_DEV)/manifest.json"
	$(LINK_CMD) "$(CURDIR)/styles.css" "$(PLUGIN_DIR_DEV)/styles.css" 2>/dev/null || :
	@if [ -f "$(DEV_DATA)" ]; then $(LINK_CMD) "$(CURDIR)/$(DEV_DATA)" "$(PLUGIN_DIR_DEV)/data.json"; fi
endif
	@echo "Starting development mode with symbolic links..."
	@echo "Plugin files are linked to $(PLUGIN_DIR_DEV)"
	@echo "Changes will be reflected immediately"
	npm run dev

# Remove development symbolic links
unlink-dev:
	$(RMDIR_CMD) "$(PLUGIN_DIR_DEV)" 2>/dev/null || :

# Install plugin to Obsidian vault
install: build
	@if [ -z "$(VAULT_PATH)" ]; then \
		echo "Error: VAULT_PATH is not set. Copy .env.local.example to .env.local and set your vault path"; \
		exit 1; \
	fi
	mkdir -p "$(PLUGIN_DIR)"
ifeq ($(OS),Windows_NT)
	@echo "Removing old files..."
	@if exist "$(PLUGIN_DIR)\main.js" $(RM_CMD) "$(PLUGIN_DIR)\main.js"
	@if exist "$(PLUGIN_DIR)\manifest.json" $(RM_CMD) "$(PLUGIN_DIR)\manifest.json"
	@if exist "$(PLUGIN_DIR)\styles.css" $(RM_CMD) "$(PLUGIN_DIR)\styles.css"
	@echo "Installing new files..."
	$(INSTALL_CMD) $(INSTALL_FLAGS) $(BUILD_FILES) "$(PLUGIN_DIR)\"
	@if exist "$(CURDIR)\$(DEV_DATA)" $(INSTALL_CMD) $(INSTALL_FLAGS) "$(DEV_DATA)" "$(PLUGIN_DIR)\data.json"
else
	@echo "Removing old files..."
	$(RM_CMD) "$(PLUGIN_DIR)/main.js" 2>/dev/null || :
	$(RM_CMD) "$(PLUGIN_DIR)/manifest.json" 2>/dev/null || :
	$(RM_CMD) "$(PLUGIN_DIR)/styles.css" 2>/dev/null || :
	@echo "Installing new files..."
	$(INSTALL_CMD) $(INSTALL_FLAGS) $(BUILD_FILES) "$(PLUGIN_DIR)/"
	@if [ -f "$(DEV_DATA)" ]; then $(INSTALL_CMD) $(INSTALL_FLAGS) "$(DEV_DATA)" "$(PLUGIN_DIR)/data.json"; fi
endif
	@echo "Plugin installed to $(PLUGIN_DIR)"
	@echo "Please restart Obsidian to apply changes"

# Clean build files
clean: unlink-dev
	$(RM_CMD) main.js 2>/dev/null || :
	$(RMDIR_CMD) .obsidian-plugin 2>/dev/null || : 