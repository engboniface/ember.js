import { DEBUG } from '@glimmer/env';

import { RenderingTestCase, moduleFor, runDestroy, runTask } from 'internal-test-helpers';
import { Helper } from '@ember/-internals/glimmer';
import { set, tracked } from '@ember/-internals/metal';
import { backtrackingMessageFor } from '../../utils/backtracking-rerender';

moduleFor(
  'Helpers test: custom helpers',
  class extends RenderingTestCase {
    ['@test it cannot override built-in syntax']() {
      this.registerHelper('if', () => 'Nope');
      expectAssertion(() => {
        this.render(`{{if foo 'LOL'}}`, { foo: true });
      }, /You attempted to overwrite the built-in helper "if" which is not allowed. Please rename the helper./);
    }

    ['@test it can resolve custom simple helpers with or without dashes']() {
      this.registerHelper('hello', () => 'hello');
      this.registerHelper('hello-world', () => 'hello world');

      this.render('{{hello}} | {{hello-world}}');

      this.assertText('hello | hello world');

      runTask(() => this.rerender());

      this.assertText('hello | hello world');
    }

    ['@test it does not resolve helpers with a `.` (period)']() {
      this.registerHelper('hello.world', () => 'hello world');

      this.render('{{hello.world}}', {
        hello: {
          world: '',
        },
      });

      this.assertText('');

      this.assertStableRerender();

      this.assertText('');

      runTask(() => set(this.context, 'hello', { world: 'hello world!' }));

      this.assertText('hello world!');

      runTask(() => {
        set(this.context, 'hello', {
          world: '',
        });
      });

      this.assertText('');
    }

    ['@test it can resolve custom class-based helpers with or without dashes']() {
      this.registerHelper('hello', {
        compute() {
          return 'hello';
        },
      });

      this.registerHelper('hello-world', {
        compute() {
          return 'hello world';
        },
      });

      this.render('{{hello}} | {{hello-world}}');

      this.assertText('hello | hello world');

      runTask(() => this.rerender());

      this.assertText('hello | hello world');
    }

    ['@test throws if `this._super` is not called from `init`']() {
      this.registerHelper('hello-world', {
        init() {},
      });

      expectAssertion(() => {
        this.render('{{hello-world}}');
      }, /You must call `this._super\(...arguments\);` when overriding `init` on a framework object. Please update .* to call `this._super\(...arguments\);` from `init`./);
    }

    ['@test class-based helper can recompute a new value'](assert) {
      let destroyCount = 0;
      let computeCount = 0;
      let helper;

      this.registerHelper('hello-world', {
        init() {
          this._super(...arguments);
          helper = this;
        },
        compute() {
          return ++computeCount;
        },
        destroy() {
          destroyCount++;
          this._super();
        },
      });

      this.render('{{hello-world}}');

      this.assertText('1');

      runTask(() => this.rerender());

      this.assertText('1');

      runTask(() => helper.recompute());

      this.assertText('2');

      assert.strictEqual(destroyCount, 0, 'destroy is not called on recomputation');
    }

    ['@test class-based helper lifecycle'](assert) {
      let hooks = [];
      let helper;

      this.registerHelper('hello-world', {
        init() {
          this._super(...arguments);
          hooks.push('init');
          helper = this;
        },
        compute() {
          hooks.push('compute');
        },
        willDestroy() {
          hooks.push('willDestroy');
          this._super();
        },
        destroy() {
          hooks.push('destroy');
          this._super();
        },
      });

      this.render('{{#if this.show}}{{hello-world}}{{/if}}', {
        show: true,
      });

      assert.deepEqual(hooks, ['init', 'compute']);

      runTask(() => this.rerender());

      assert.deepEqual(hooks, ['init', 'compute']);

      runTask(() => helper.recompute());

      assert.deepEqual(hooks, ['init', 'compute', 'compute']);

      runTask(() => set(this.context, 'show', false));

      assert.deepEqual(hooks, ['init', 'compute', 'compute', 'destroy', 'willDestroy']);
    }

    ['@test class-based helper with static arguments can recompute a new value'](assert) {
      let destroyCount = 0;
      let computeCount = 0;
      let helper;

      this.registerHelper('hello-world', {
        init() {
          this._super(...arguments);
          helper = this;
        },
        compute() {
          return ++computeCount;
        },
        destroy() {
          destroyCount++;
          this._super();
        },
      });

      this.render('{{hello-world "whut"}}');

      this.assertText('1');

      runTask(() => this.rerender());

      this.assertText('1');

      runTask(() => helper.recompute());

      this.assertText('2');

      assert.strictEqual(destroyCount, 0, 'destroy is not called on recomputation');
    }

    // https://github.com/emberjs/ember.js/issues/14774
    ['@test class-based helper with static arguments can recompute a new value without a runloop'](
      assert
    ) {
      let destroyCount = 0;
      let computeCount = 0;
      let helper;

      this.registerHelper('hello-world', {
        init() {
          this._super(...arguments);
          helper = this;
        },
        compute() {
          return ++computeCount;
        },
        destroy() {
          destroyCount++;
          this._super();
        },
      });

      this.render('{{hello-world "whut"}}');

      this.assertText('1');

      runTask(() => this.rerender());

      this.assertText('1');

      helper.recompute();

      this.assertText('2');

      assert.strictEqual(destroyCount, 0, 'destroy is not called on recomputation');
    }

    ['@test helper params can be returned']() {
      this.registerHelper('hello-world', values => {
        return values;
      });

      this.render('{{#each (hello-world model) as |item|}}({{item}}){{/each}}', {
        model: ['bob'],
      });

      this.assertText('(bob)');
    }

    ['@test helper hash can be returned']() {
      this.registerHelper('hello-world', (_, hash) => {
        return hash.model;
      });

      this.render(`{{get (hello-world model=this.model) 'name'}}`, {
        model: { name: 'bob' },
      });

      this.assertText('bob');
    }

    ['@test simple helper is called for param changes'](assert) {
      let computeCount = 0;

      this.registerHelper('hello-world', ([value]) => {
        computeCount++;
        return `${value}-value`;
      });

      this.render('{{hello-world this.model.name}}', {
        model: { name: 'bob' },
      });

      this.assertText('bob-value');

      assert.strictEqual(computeCount, 1, 'compute is called exactly 1 time');

      runTask(() => this.rerender());

      this.assertText('bob-value');

      assert.strictEqual(computeCount, 1, 'compute is called exactly 1 time');

      runTask(() => set(this.context, 'model.name', 'sal'));

      this.assertText('sal-value');

      assert.strictEqual(computeCount, 2, 'compute is called exactly 2 times');

      runTask(() => set(this.context, 'model', { name: 'bob' }));

      this.assertText('bob-value');

      assert.strictEqual(computeCount, 3, 'compute is called exactly 3 times');
    }

    ['@test class-based helper compute is called for param changes'](assert) {
      let createCount = 0;
      let computeCount = 0;

      this.registerHelper('hello-world', {
        init() {
          this._super(...arguments);
          createCount++;
        },
        compute([value]) {
          computeCount++;
          return `${value}-value`;
        },
      });

      this.render('{{hello-world this.model.name}}', {
        model: { name: 'bob' },
      });

      this.assertText('bob-value');

      assert.strictEqual(computeCount, 1, 'compute is called exactly 1 time');

      runTask(() => this.rerender());

      this.assertText('bob-value');

      assert.strictEqual(computeCount, 1, 'compute is called exactly 1 time');

      runTask(() => set(this.context, 'model.name', 'sal'));

      this.assertText('sal-value');

      assert.strictEqual(computeCount, 2, 'compute is called exactly 2 times');

      runTask(() => set(this.context, 'model', { name: 'bob' }));

      this.assertText('bob-value');

      assert.strictEqual(computeCount, 3, 'compute is called exactly 3 times');
      assert.strictEqual(createCount, 1, 'helper is only created once');
    }

    ['@test simple helper receives params, hash']() {
      this.registerHelper('hello-world', (_params, _hash) => {
        return `params: ${JSON.stringify(_params)}, hash: ${JSON.stringify(_hash)}`;
      });

      this.render('{{hello-world this.model.name "rich" first=this.model.age last="sam"}}', {
        model: {
          name: 'bob',
          age: 42,
        },
      });

      this.assertText('params: ["bob","rich"], hash: {"first":42,"last":"sam"}');

      runTask(() => this.rerender());

      this.assertText('params: ["bob","rich"], hash: {"first":42,"last":"sam"}');

      runTask(() => set(this.context, 'model.name', 'sal'));

      this.assertText('params: ["sal","rich"], hash: {"first":42,"last":"sam"}');

      runTask(() => set(this.context, 'model.age', 28));

      this.assertText('params: ["sal","rich"], hash: {"first":28,"last":"sam"}');

      runTask(() => set(this.context, 'model', { name: 'bob', age: 42 }));

      this.assertText('params: ["bob","rich"], hash: {"first":42,"last":"sam"}');
    }

    ['@test class-based helper receives params, hash']() {
      this.registerHelper('hello-world', {
        compute(_params, _hash) {
          return `params: ${JSON.stringify(_params)}, hash: ${JSON.stringify(_hash)}`;
        },
      });

      this.render('{{hello-world this.model.name "rich" first=this.model.age last="sam"}}', {
        model: {
          name: 'bob',
          age: 42,
        },
      });

      this.assertText('params: ["bob","rich"], hash: {"first":42,"last":"sam"}');

      runTask(() => this.rerender());

      this.assertText('params: ["bob","rich"], hash: {"first":42,"last":"sam"}');

      runTask(() => set(this.context, 'model.name', 'sal'));

      this.assertText('params: ["sal","rich"], hash: {"first":42,"last":"sam"}');

      runTask(() => set(this.context, 'model.age', 28));

      this.assertText('params: ["sal","rich"], hash: {"first":28,"last":"sam"}');

      runTask(() => set(this.context, 'model', { name: 'bob', age: 42 }));

      this.assertText('params: ["bob","rich"], hash: {"first":42,"last":"sam"}');
    }

    ['@test class-based helper usable in subexpressions']() {
      this.registerHelper('join-words', {
        compute(params) {
          return params.join(' ');
        },
      });

      this.render(
        `{{join-words "Who"
                   (join-words "overcomes" "by")
                   this.model.reason
                   (join-words (join-words "hath overcome but" "half"))
                   (join-words "his" (join-words "foe"))}}`,
        { model: { reason: 'force' } }
      );

      this.assertText('Who overcomes by force hath overcome but half his foe');

      runTask(() => this.rerender());

      this.assertText('Who overcomes by force hath overcome but half his foe');

      runTask(() => set(this.context, 'model.reason', 'Nickleback'));

      this.assertText('Who overcomes by Nickleback hath overcome but half his foe');

      runTask(() => set(this.context, 'model', { reason: 'force' }));

      this.assertText('Who overcomes by force hath overcome but half his foe');
    }

    ['@test parameterless helper is usable in subexpressions']() {
      this.registerHelper('should-show', () => {
        return true;
      });

      this.render(`{{#if (should-show)}}true{{/if}}`);

      this.assertText('true');

      runTask(() => this.rerender());

      this.assertText('true');
    }

    ['@test parameterless helper is usable in attributes']() {
      this.registerHelper('foo-bar', () => {
        return 'baz';
      });

      this.render(`<div data-foo-bar="{{foo-bar}}"></div>`);

      this.assertHTML('<div data-foo-bar="baz"></div>');

      runTask(() => this.rerender());

      this.assertHTML('<div data-foo-bar="baz"></div>');
    }

    ['@test simple helper not usable with a block']() {
      this.registerHelper('some-helper', () => {});

      expectAssertion(() => {
        this.render(`{{#some-helper}}{{/some-helper}}`);
      }, /Helpers may not be used in the block form/);
    }

    ['@test class-based helper not usable with a block']() {
      this.registerHelper('some-helper', {
        compute() {},
      });

      expectAssertion(() => {
        this.render(`{{#some-helper}}{{/some-helper}}`);
      }, /Helpers may not be used in the block form/);
    }

    ['@test simple helper not usable within element']() {
      this.registerHelper('some-helper', () => {});

      this.assert.throws(() => {
        this.render(`<div {{some-helper}}></div>`);
      }, /Error: Compile Error: Unexpected Modifier some-helper @ 0..0/);
    }

    ['@test class-based helper not usable within element']() {
      this.registerHelper('some-helper', {
        compute() {},
      });

      this.assert.throws(() => {
        this.render(`<div {{some-helper}}></div>`);
      }, /Error: Compile Error: Unexpected Modifier some-helper @ 0..0/);
    }

    ['@test class-based helper is torn down'](assert) {
      let destroyCalled = 0;

      this.registerHelper('some-helper', {
        destroy() {
          destroyCalled++;
          this._super(...arguments);
        },
        compute() {
          return 'must define a compute';
        },
      });

      this.render(`{{some-helper}}`);

      runDestroy(this.component);

      assert.strictEqual(destroyCalled, 1, 'destroy called once');
    }

    ['@test class-based helper used in subexpression can recompute']() {
      let helper;
      let phrase = 'overcomes by';

      this.registerHelper('dynamic-segment', {
        init() {
          this._super(...arguments);
          helper = this;
        },
        compute() {
          return phrase;
        },
      });

      this.registerHelper('join-words', {
        compute(params) {
          return params.join(' ');
        },
      });

      this.render(
        `{{join-words "Who"
                   (dynamic-segment)
                   "force"
                   (join-words (join-words "hath overcome but" "half"))
                   (join-words "his" (join-words "foe"))}}`
      );

      this.assertText('Who overcomes by force hath overcome but half his foe');

      runTask(() => this.rerender());

      this.assertText('Who overcomes by force hath overcome but half his foe');

      phrase = 'believes his';

      runTask(() => helper.recompute());

      this.assertText('Who believes his force hath overcome but half his foe');

      phrase = 'overcomes by';

      runTask(() => helper.recompute());

      this.assertText('Who overcomes by force hath overcome but half his foe');
    }

    ['@test class-based helper used in subexpression can recompute component']() {
      let helper;
      let phrase = 'overcomes by';

      this.registerHelper('dynamic-segment', {
        init() {
          this._super(...arguments);
          helper = this;
        },
        compute() {
          return phrase;
        },
      });

      this.registerHelper('join-words', {
        compute(params) {
          return params.join(' ');
        },
      });

      this.registerComponent('some-component', {
        template: '{{first}} {{second}} {{third}} {{fourth}} {{fifth}}',
      });

      this.render(
        `{{some-component first="Who"
                   second=(dynamic-segment)
                   third="force"
                   fourth=(join-words (join-words "hath overcome but" "half"))
                   fifth=(join-words "his" (join-words "foe"))}}`
      );

      this.assertText('Who overcomes by force hath overcome but half his foe');

      runTask(() => this.rerender());

      this.assertText('Who overcomes by force hath overcome but half his foe');

      phrase = 'believes his';

      runTask(() => helper.recompute());

      this.assertText('Who believes his force hath overcome but half his foe');

      phrase = 'overcomes by';

      runTask(() => helper.recompute());

      this.assertText('Who overcomes by force hath overcome but half his foe');
    }

    ['@test class-based helper used in subexpression is destroyed'](assert) {
      let destroyCount = 0;

      this.registerHelper('dynamic-segment', {
        phrase: 'overcomes by',
        init() {
          this._super(...arguments);
        },
        compute() {
          return this.phrase;
        },
        destroy() {
          destroyCount++;
          this._super(...arguments);
        },
      });

      this.registerHelper('join-words', {
        compute(params) {
          return params.join(' ');
        },
      });

      this.render(
        `{{join-words "Who"
                   (dynamic-segment)
                   "force"
                   (join-words (join-words "hath overcome but" "half"))
                   (join-words "his" (join-words "foe"))}}`
      );

      runDestroy(this.component);

      assert.equal(destroyCount, 1, 'destroy is called after a view is destroyed');
    }

    ['@test simple helper can be invoked manually via `owner.factoryFor(...).create().compute()'](
      assert
    ) {
      this.registerHelper('some-helper', () => {
        assert.ok(true, 'some-helper helper invoked');
        return 'lolol';
      });

      let instance = this.owner.factoryFor('helper:some-helper').create();

      assert.equal(typeof instance.compute, 'function', 'expected instance.compute to be present');
      assert.equal(instance.compute(), 'lolol', 'can invoke `.compute`');
    }

    ['@test class-based helper can be invoked manually via `owner.factoryFor(...).create().compute()'](
      assert
    ) {
      this.registerHelper('some-helper', {
        compute() {
          assert.ok(true, 'some-helper helper invoked');
          return 'lolol';
        },
      });

      let instance = this.owner.factoryFor('helper:some-helper').create();

      assert.equal(typeof instance.compute, 'function', 'expected instance.compute to be present');
      assert.equal(instance.compute(), 'lolol', 'can invoke `.compute`');
    }

    ['@test class-based helper in native ES syntax receives owner'](assert) {
      let testContext = this;
      this.add(
        'helper:hello-world',
        class extends Helper {
          constructor(owner) {
            super(owner);

            assert.equal(owner, testContext.owner, 'owner was passed as a constructor argument');
          }

          compute() {
            return 'huzza!';
          }
        }
      );

      this.render('{{hello-world}}');

      this.assertText('huzza!');
    }

    ['@test class-based helper gives helpful warning when mutating a value that was tracked already']() {
      this.add(
        'helper:hello-world',
        class extends Helper {
          compute() {
            this.get('value');
            this.set('value', 123);
          }
        }
      );

      let expectedMessage = backtrackingMessageFor('value', '<.+?>', {
        renderTree: ['\\(result of a `<\\(unknown\\).*?>` helper\\)'],
      });

      expectDeprecation(() => {
        this.render('{{hello-world}}');
      }, expectedMessage);
    }

    ['@test class-based helper gives helpful assertion when mutating a tracked property that was tracked already']() {
      this.add(
        'helper:hello-world',
        class HelloWorld extends Helper {
          @tracked value;

          compute() {
            this.value;
            this.value = 123;
          }
        }
      );

      let expectedMessage = backtrackingMessageFor('value', '<HelloWorld.+?>', {
        renderTree: ['\\(result of a `<HelloWorld.*?>` helper\\)'],
      });

      expectAssertion(() => {
        this.render('{{hello-world}}');
      }, expectedMessage);
    }
  }
);

if (DEBUG) {
  class HelperMutatingArgsTests extends RenderingTestCase {
    buildCompute() {
      return (params, hash) => {
        this.assert.throws(() => {
          params.push('foo');

          // cannot assert error message as it varies by platform
        });

        this.assert.throws(() => {
          hash.foo = 'bar';

          // cannot assert error message as it varies by platform
        });

        this.assert.throws(() => {
          hash.someUnusedHashProperty = 'bar';

          // cannot assert error message as it varies by platform
        });
      };
    }

    ['@test cannot mutate params - no positional specified / named specified']() {
      this.render('{{test-helper foo=bar}}', { bar: 'derp' });
    }

    ['@test cannot mutate params - positional specified / no named specified']() {
      this.render('{{test-helper bar}}', { bar: 'derp' });
    }

    ['@test cannot mutate params - positional specified / named specified']() {
      this.render('{{test-helper bar foo=qux}}', { bar: 'derp', qux: 'baz' });
    }

    ['@test cannot mutate params - no positional specified / no named specified']() {
      this.render('{{test-helper}}', { bar: 'derp', qux: 'baz' });
    }
  }

  moduleFor(
    'Helpers test: mutation triggers errors - class based helper',
    class extends HelperMutatingArgsTests {
      constructor() {
        super(...arguments);

        let compute = this.buildCompute();

        this.registerHelper('test-helper', {
          compute,
        });
      }
    }
  );

  moduleFor(
    'Helpers test: mutation triggers errors - simple helper',
    class extends HelperMutatingArgsTests {
      constructor() {
        super(...arguments);

        let compute = this.buildCompute();

        this.registerHelper('test-helper', compute);
      }
    }
  );
}
