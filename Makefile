.PHONY:			FORCE


#
# Building
#
lib/index.js:		src/*.ts src/*/*.ts Makefile node_modules
	rm -f lib/*.js
	npx tsc -t es2022 -m es2022 --moduleResolution node --esModuleInterop	\
		--strictNullChecks 						\
		--outDir lib -d --sourceMap src/index.ts
	chmod a+x $@

build-watch:
	@inotifywait -r -m -e modify		\
		--includei '.*\.ts'		\
			src/			\
	| while read -r dir event file; do	\
		echo -e "\x1b[37m$$event $$dir$$file\x1b[0m";\
		make lib/index.js;		\
	done


#
# Project
#
package-lock.json:	package.json
	npm install
	touch $@
node_modules:		package-lock.json
	npm install
	touch $@

npm-reinstall-local:
	npm uninstall $(NPM_PACKAGE); npm i --save $(LOCAL_PATH)
npm-reinstall-public:
	npm uninstall $(NPM_PACKAGE); npm i --save $(NPM_PACKAGE)
npm-reinstall-dev-local:
	npm uninstall $(NPM_PACKAGE); npm i --save-dev $(LOCAL_PATH)
npm-reinstall-dev-public:
	npm uninstall $(NPM_PACKAGE); npm i --save-dev $(NPM_PACKAGE)

npm-use-app-interface-client-public:
npm-use-app-interface-client-local:
npm-use-app-interface-client-%:
	NPM_PACKAGE=@spartan-hc/app-interface-client LOCAL_PATH=../app-interface-client-js make npm-reinstall-$*

npm-use-backdrop-public:
npm-use-backdrop-local:
npm-use-backdrop-%:
	NPM_PACKAGE=@spartan-hc/holochain-backdrop LOCAL_PATH=../node-backdrop make npm-reinstall-dev-$*

npm-use-bundles-public:
npm-use-bundles-local:
npm-use-bundles-%:
	NPM_PACKAGE=@spartan-hc/bundles LOCAL_PATH=../bundles-js make npm-reinstall-$*


#
# Testing
#
TEST_DNAS		= tests/dnas/zomehub.dna

tests/dnas/zomehub.dna:		../devhub-dnas-feature-cli-support/dnas/zomehub.dna
	cp $< $@

DEBUG_LEVEL	       ?= warn
TEST_ENV_VARS		= LOG_LEVEL=$(DEBUG_LEVEL)
MOCHA_OPTS		= -n enable-source-maps -t 5000

test:
	make -s test-unit
	make -s test-integration

test-unit:
	make -s test-unit-basic
	make -s test-unit-no-holochain

test-unit-basic:		lib/index.js Makefile
	$(TEST_ENV_VARS) npx mocha $(MOCHA_OPTS) ./tests/unit/test_basic.js
test-unit-no-holochain:		lib/index.js Makefile
	$(TEST_ENV_VARS) npx mocha $(MOCHA_OPTS) ./tests/unit/test_no_holochain.js

test-integration:
	make -s test-integration-basic

test-integration-basic:		lib/index.js Makefile $(TEST_DNAS)
	$(TEST_ENV_VARS) npx mocha $(MOCHA_OPTS) ./tests/integration/test_basic.js


#
# Repository
#
clean-remove-chaff:
	@find . -name '*~' -exec rm {} \;
clean-files:		clean-remove-chaff
	git clean -nd
clean-files-force:	clean-remove-chaff
	git clean -fd
clean-files-all:	clean-remove-chaff
	git clean -ndx
clean-files-all-force:	clean-remove-chaff
	git clean -fdx


#
# NPM packaging
#
prepare-package:
	make -s lib/index.js
preview-package:	clean-files test prepare-package
	npm pack --dry-run .
create-package:		clean-files test prepare-package
	npm pack .
publish-package:	clean-files test prepare-package
	npm publish --access public .
