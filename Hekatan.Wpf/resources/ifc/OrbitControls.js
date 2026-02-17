/**
 * OrbitControls para Three.js (versión global/UMD)
 * Basado en THREE.OrbitControls
 */

(function() {
    'use strict';

    THREE.OrbitControls = function(object, domElement) {
        this.object = object;
        this.domElement = domElement || document;

        // API
        this.enabled = true;
        this.target = new THREE.Vector3();

        // Damping
        this.enableDamping = false;
        this.dampingFactor = 0.05;

        // Limits
        this.minDistance = 0;
        this.maxDistance = Infinity;

        // Mouse buttons
        this.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };

        // Internal state
        var scope = this;
        var STATE = { NONE: -1, ROTATE: 0, DOLLY: 1, PAN: 2 };
        var state = STATE.NONE;

        var spherical = new THREE.Spherical();
        var sphericalDelta = new THREE.Spherical();
        var scale = 1;
        var panOffset = new THREE.Vector3();

        var rotateStart = new THREE.Vector2();
        var rotateEnd = new THREE.Vector2();
        var rotateDelta = new THREE.Vector2();

        var panStart = new THREE.Vector2();
        var panEnd = new THREE.Vector2();
        var panDelta = new THREE.Vector2();

        var dollyStart = new THREE.Vector2();
        var dollyEnd = new THREE.Vector2();
        var dollyDelta = new THREE.Vector2();

        // Methods
        this.update = function() {
            var offset = new THREE.Vector3();
            var quat = new THREE.Quaternion().setFromUnitVectors(
                object.up,
                new THREE.Vector3(0, 1, 0)
            );
            var quatInverse = quat.clone().invert();

            var lastPosition = new THREE.Vector3();
            var lastQuaternion = new THREE.Quaternion();

            return function update() {
                var position = scope.object.position;

                offset.copy(position).sub(scope.target);
                offset.applyQuaternion(quat);

                spherical.setFromVector3(offset);

                if (scope.enableDamping) {
                    spherical.theta += sphericalDelta.theta * scope.dampingFactor;
                    spherical.phi += sphericalDelta.phi * scope.dampingFactor;
                } else {
                    spherical.theta += sphericalDelta.theta;
                    spherical.phi += sphericalDelta.phi;
                }

                // Restrict phi to be between EPS and PI-EPS
                var EPS = 0.000001;
                spherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, spherical.phi));
                spherical.makeSafe();

                spherical.radius *= scale;
                spherical.radius = Math.max(scope.minDistance, Math.min(scope.maxDistance, spherical.radius));

                scope.target.add(panOffset);

                offset.setFromSpherical(spherical);
                offset.applyQuaternion(quatInverse);

                position.copy(scope.target).add(offset);
                scope.object.lookAt(scope.target);

                if (scope.enableDamping === true) {
                    sphericalDelta.theta *= (1 - scope.dampingFactor);
                    sphericalDelta.phi *= (1 - scope.dampingFactor);
                    panOffset.multiplyScalar(1 - scope.dampingFactor);
                } else {
                    sphericalDelta.set(0, 0, 0);
                    panOffset.set(0, 0, 0);
                }

                scale = 1;

                return false;
            };
        }();

        function rotateLeft(angle) {
            sphericalDelta.theta -= angle;
        }

        function rotateUp(angle) {
            sphericalDelta.phi -= angle;
        }

        var panLeft = function() {
            var v = new THREE.Vector3();
            return function panLeft(distance, objectMatrix) {
                v.setFromMatrixColumn(objectMatrix, 0);
                v.multiplyScalar(-distance);
                panOffset.add(v);
            };
        }();

        var panUp = function() {
            var v = new THREE.Vector3();
            return function panUp(distance, objectMatrix) {
                v.setFromMatrixColumn(objectMatrix, 1);
                v.multiplyScalar(distance);
                panOffset.add(v);
            };
        }();

        var pan = function() {
            var offset = new THREE.Vector3();
            return function pan(deltaX, deltaY) {
                var element = scope.domElement;
                if (scope.object.isPerspectiveCamera) {
                    var position = scope.object.position;
                    offset.copy(position).sub(scope.target);
                    var targetDistance = offset.length();
                    targetDistance *= Math.tan((scope.object.fov / 2) * Math.PI / 180.0);
                    panLeft(2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix);
                    panUp(2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix);
                }
            };
        }();

        function dollyIn(dollyScale) {
            scale /= dollyScale;
        }

        function dollyOut(dollyScale) {
            scale *= dollyScale;
        }

        // Event handlers
        function onMouseDown(event) {
            if (scope.enabled === false) return;

            event.preventDefault();

            switch (event.button) {
                case 0: // Left
                    if (scope.mouseButtons.LEFT === THREE.MOUSE.ROTATE) {
                        rotateStart.set(event.clientX, event.clientY);
                        state = STATE.ROTATE;
                    }
                    break;
                case 1: // Middle
                    if (scope.mouseButtons.MIDDLE === THREE.MOUSE.DOLLY) {
                        dollyStart.set(event.clientX, event.clientY);
                        state = STATE.DOLLY;
                    }
                    break;
                case 2: // Right
                    if (scope.mouseButtons.RIGHT === THREE.MOUSE.PAN) {
                        panStart.set(event.clientX, event.clientY);
                        state = STATE.PAN;
                    }
                    break;
            }

            if (state !== STATE.NONE) {
                document.addEventListener('mousemove', onMouseMove, false);
                document.addEventListener('mouseup', onMouseUp, false);
            }
        }

        function onMouseMove(event) {
            if (scope.enabled === false) return;

            event.preventDefault();

            if (state === STATE.ROTATE) {
                rotateEnd.set(event.clientX, event.clientY);
                rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(0.5);

                var element = scope.domElement;
                rotateLeft(2 * Math.PI * rotateDelta.x / element.clientHeight);
                rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight);

                rotateStart.copy(rotateEnd);
                scope.update();

            } else if (state === STATE.DOLLY) {
                dollyEnd.set(event.clientX, event.clientY);
                dollyDelta.subVectors(dollyEnd, dollyStart);

                if (dollyDelta.y > 0) {
                    dollyIn(0.95);
                } else if (dollyDelta.y < 0) {
                    dollyOut(0.95);
                }

                dollyStart.copy(dollyEnd);
                scope.update();

            } else if (state === STATE.PAN) {
                panEnd.set(event.clientX, event.clientY);
                panDelta.subVectors(panEnd, panStart).multiplyScalar(0.5);

                pan(panDelta.x, panDelta.y);

                panStart.copy(panEnd);
                scope.update();
            }
        }

        function onMouseUp() {
            if (scope.enabled === false) return;

            document.removeEventListener('mousemove', onMouseMove, false);
            document.removeEventListener('mouseup', onMouseUp, false);

            state = STATE.NONE;
        }

        function onMouseWheel(event) {
            if (scope.enabled === false) return;

            event.preventDefault();
            event.stopPropagation();

            if (event.deltaY < 0) {
                dollyOut(0.95);
            } else if (event.deltaY > 0) {
                dollyIn(0.95);
            }

            scope.update();
        }

        function onContextMenu(event) {
            if (scope.enabled === false) return;
            event.preventDefault();
        }

        // Connect events
        this.domElement.addEventListener('contextmenu', onContextMenu, false);
        this.domElement.addEventListener('mousedown', onMouseDown, false);
        this.domElement.addEventListener('wheel', onMouseWheel, false);

        // Force an update at start
        this.update();
    };

})();
