import {parseHeaders} from '../parse_headers';

describe(parseHeaders.name, function() {
    it('parses kafka message headers', function() {
        expect(
            parseHeaders({
                key: Buffer.from('value')
            })
        ).toMatchInlineSnapshot(`
            Object {
              "key": "value",
            }
        `);
    });
});
