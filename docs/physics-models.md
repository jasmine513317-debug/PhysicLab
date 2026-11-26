# Physics models

World coordinates use X right and Y up. Distances are in meters, mass in kilograms, and time in seconds. Canvas coordinates convert through the camera, with 80 px/m as the nominal original scale and smaller initial scales used to fit compact viewports.

- **Gravity.** Planck applies uniform gravity with a configurable direction and a default of 9.81 m/s² downward. The vertical-gravity, zero-damping reference is x = x₀ + vₓt and y = y₀ + vᵧt − gt²/2. For a circular projectile over a level floor, reference impact occurs when its center reaches floor height plus radius. Finite-step integration introduces a measurable trajectory error.
- **Rigid bodies.** The engine solves normal collisions and approximate Coulomb contact friction. The two fixtures contribute to mixed friction and restitution. The inspector density is mass per unit area in kg/m². There is no model of separately calibrated static and kinetic coefficients.
- **Springs.** Planck distance joints use local anchors, rest length, damping ratio, and frequency. UI stiffness is mapped to frequency through f = √(k / μ) / (2π), with reduced translational mass μ. Off-center anchors and body rotation couple translation and rotation. Frequencies at or above 30 Hz are rejected at the 60 Hz integration rate.
- **Acceleration and force.** Reported acceleration is a fixed-step finite difference of linear velocity. The force overlay can show the measured contact normal and friction impulses divided by the step. These are step-average forces. They vary with the solver step and require fresh contact impulses. Strict inverse support loads are available for a single stationary horizontal contact.
- **Energy.** Translational and rotational kinetic energy use the center-of-mass inertia. Gravitational energy uses Y = 0 as the datum. Spring energy uses ½kΔL² and is allocated among the joint's dynamic endpoints to avoid double-counting. Per-body tracked energy can change via contact, joint exchange, damping, friction, external work, and integration error.
- **Momentum.** Each body contributes its configured mass times its recorded center-of-mass velocity. The system chart sums signed X and Y components over all dynamic objects at each shared sample time. The kinetic-energy sum includes translation and rotation. Changes are measured over the displayed recording window, and gravity, applied forces, and contact with static fixtures can change system momentum.

The free-fall and projectile templates use the uniform-gravity reference for comparison. A horizontal floor limits the reference to the predicted impact time. The comparison lists vertical position and velocity at the latest reference sample and the RMS path error over retained pre-impact samples. The reference is suspended when the engine records an applied external force or the scene contains contacts or constraints outside the reference model.

On a straight incline, the reference downhill acceleration for sustained sliding is g(sin θ − μ cos θ), with positive inclination angle θ and effective contact friction μ equal to the geometric mean of the two fixture coefficients. The incline tests use a block already moving downhill on a stationary surface. They compare projected displacement and velocity over the first second of sliding.

Samples are recorded every four fixed steps (15 Hz). Replay records each body's angle with its pose and retains the exact terminal step when the run ends between sample times. This can miss extrema and fast collision events. Graphs and comparisons use recorded data. Simulation time and units appear in CSV column names.

## Geometry Studio collision tracks

A converted 2D curve becomes one static Planck chain with linked edges. A rigid body can contact either side and can leave the track. Positions use meters, with positive Y upward. The solver uses the same 60 Hz step, contact friction, and restitution as the mechanics workspace.

Bézier curves are split by de Casteljau subdivision. The flatness test uses the distance of the control points from the chord. Polyline simplification uses the other half of the selected forward deviation tolerance. Explicit, parametric, and polar plots use bounded adaptive sampling, then simplify the sampled polyline. The tolerance for expressions is an estimate from evaluated points. Increase the base density and check the plot when a function changes rapidly. Sampling can miss narrow gaps and high-frequency features between evaluation points.

Track conversion rejects unresolved intervals, self-intersections, segments shorter than 0.02 m, and nearly reversing corners. Chains support at most 256 vertices. Use a smaller domain or higher tolerance if the geometry exceeds the vertex limit. Narrow details, high velocities, and sharp changes in slope remain subject to Planck contact and time-step limits. The flat-track test expects a resting sphere center within 0.05 m of its radius above the surface. A separate simulation checks that a ball starting off-center rolls across a discretized parabolic track without passing through it.

For an ideal bead, the solver integrates distance along the polyline as the single generalized coordinate. It projects gravity, applied forces and impulses onto the tangent. The normal constraint force follows from the step-average acceleration minus applied forces. It ignores bead rolling and collisions with other bodies. Open endpoints stop the bead when it reaches the boundary and closed curves wrap the coordinate.

The 3D preview samples a height field on a rectangular grid. Cells with invalid corner samples are omitted. The mesh is triangulated for orthographic rendering and OBJ export. View rotation and normals are geometric calculations.

## Electrostatics

The scene displays a planar slice of the three-dimensional vacuum field of fixed point charges. The solver converts nC to C, takes the distance r in meters, and sums each charge's electric field kq r̂/r² and potential kq/r. The potential reference is zero at infinity. At a nonzero source location, the ideal point-charge field and potential are singular.

Field lines follow the normalized field with midpoint integration. Arrowheads show the physical direction, and vector length is compressed for readability. Line density and endpoint cores are display choices. Equipotentials use marching squares on the visible grid with linear edge interpolation. The heat map compresses and clips the display range. The probe evaluates the analytical field independently of the sampled layers.

## Newtonian two-body orbits

The solver integrates relative motion in a plane using the Newtonian acceleration −μr/|r|³ with μ equal to the sum of the two gravitational parameters. AU, Julian years, and solar mass units are used internally. Velocity fields convert to km/s. The barycentric positions are reconstructed by splitting the relative displacement in inverse proportion to the masses.

The initial relative energy and angular momentum determine the theoretical ellipse, eccentricity, apsides, and period. Velocity Verlet advances the relative state using a fixed step chosen from the initial orbital timescales. Integration stops before the bodies touch. Closely grazing or highly eccentric trajectories can require many steps per revolution. The three-orbit comparison limits the iteration count and reports when its numerical budget is exceeded.

The second body’s displayed sectors and areas use the barycenter as the focus. Areas are estimated by summing triangles over equal numbers of integration steps. The measured period comes from a full signed revolution with interpolation across the final angle. The third-law check runs three ellipses at 0.75, 1, and 1.35 times the original semimajor axis, keeping both masses and eccentricity fixed. Energy and angular momentum readouts and exports use the barycentric frame.

## Extended experiments

- The ideal centered spring has underdamped period 2π√(m/k)/√(1−ζ²). Its reference assumes one fixed endpoint, axial motion, and no contact. The pendulum integrates θ̈ = −g sin θ/L with fixed-step Velocity Verlet. Its finite-amplitude period uses the complete elliptic integral for the energy of the initial state.
- The two-body escape threshold is √(2μ/r), using relative separation and the sum of both gravitational parameters. The buttons set the relative velocity tangentially while preserving the center-of-mass velocity.
- The particle uses a Boris velocity update and trapezoidal position integration for uniform in-plane electric and perpendicular magnetic fields. A pure magnetic field conserves speed. The nonrelativistic simulation pauses before the speed reaches 0.1c.
- The RC model uses the exact exponential update with time constant R·C. The source is fixed while charging and the discharge loop has a zero-volt target. The ideal switch can change the current instantaneously while capacitor voltage is continuous.

## Double pendulum

Two point masses move in a vertical plane on massless rigid rods with frictionless pivots. Angles are measured from the downward vertical. The solver obtains both angular accelerations by solving the coupled Euler–Lagrange mass matrix and advances the state using classical fourth-order Runge–Kutta. The energy readout includes both bobs' kinetic and gravitational energy, with potential zero at the lowest configuration.

The comparison changes only the second starting angle. It overlays the lower-bob trajectories and measures their separation. A separate run repeats the original initial conditions at half the integration step. The distance to this finer run estimates numerical resolution and should be much smaller than the perturbed-run separation to interpret that separation. This comparison provides a finite-time sensitivity demonstration. Long-time trajectories can lose predictability even when the energy drifts little.

For equal masses and lengths, the small-angle reference mode has frequency √((2−√2)g/L) and second-angle amplitude √2 times the first. Tests cover one period of this mode and check that the default case's separation after 12 seconds exceeds its half-step discrepancy by a factor of 50. The workspace also monitors energy drift, normalized by the larger of the initial energy magnitude and the gravitational energy scale, and pauses at 2%.

## Three-body gravity and gravity assist

All three point masses exert pairwise Newtonian gravity in a plane. Positions, times, and masses use AU, Julian years, and solar masses. A kick–drift–kick integrator reduces the step near encounters using the pair separation, relative speed, and gravitational timescale. The calculation pauses before any pair crosses the 0.002 AU cutoff. No collision response is modeled.

The three-body template starts with the equal-mass figure eight. Validation checks return within 0.004 AU after one approximately 1.007-year orbit, normalized energy drift below 5 × 10⁻⁵, and improved energy drift with half the base step. The comparison shifts the third body's starting X coordinate. The chart and readouts track separation, center of mass, total energy, and drift in total linear and angular momentum. Energy drift is normalized by initial kinetic energy plus the magnitude of initial potential energy. [Chenciner and Montgomery's figure-eight solution](https://annals.math.princeton.edu/articles/12364)

In the gravity-assist template, the spacecraft starts outside the measurement circle. The comparison interpolates speed as it enters and exits the same planet-centered radius and derives specific kinetic energy from half the squared relative speed. The default trajectory gains more than 7 km/s in the star frame while changing by less than 0.03 km/s in the planet frame at the selected radius. The planet-frame difference can be nonzero because the star also exerts gravity during the flyby. The template uses an illustrative geometry and maintains the full system's energy and momentum through pairwise interactions. [NASA gravity-assist primer](https://science.nasa.gov/learn/basics-of-space-flight/primer/)

## Electromagnetic induction

A fixed single-turn loop in a spatially uniform field has flux Φ = A·B·cos θ, where θ is the angle from the loop's positive normal to the field axis. Over a ten-second observation the model uses B(t) = B₀ + t·dB/dt, giving the signed electromotive force ε = −A·cos θ·dB/dt. The closed loop has I = ε/R. The open loop has zero current and retains the induced electromotive force. The loop omits self-inductance and feedback on the prescribed field. The tests compare EMF with the finite difference of computed flux and check sign reversal, a zero projected area, and open-circuit behavior. [OpenStax on induced electric fields](https://openstax.org/books/university-physics-volume-2/pages/13-4-induced-electric-fields)
