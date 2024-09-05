package v4

import (
	"reflect"
	"testing"

	v3 "go.signoz.io/signoz/pkg/query-service/model/v3"
)

func Test_buildResourceFilter(t *testing.T) {
	type args struct {
		logsOp string
		key    string
		op     v3.FilterOperator
		value  interface{}
	}
	tests := []struct {
		name string
		args args
		want string
	}{
		{
			name: "test exists",
			args: args{
				key: "service.name",
				op:  v3.FilterOperatorExists,
			},
			want: `simpleJSONHas(lower(labels), 'service.name')`,
		},
		{
			name: "test nexists",
			args: args{
				key: "service.name",
				op:  v3.FilterOperatorNotExists,
			},
			want: `not simpleJSONHas(lower(labels), 'service.name')`,
		},
		{
			name: "test regex",
			args: args{
				logsOp: "match(%s, %s)",
				key:    "service.name",
				op:     v3.FilterOperatorRegex,
				value:  ".*",
			},
			want: `match(simpleJSONExtractString(lower(labels), 'service.name'), '.*')`,
		},
		{
			name: "test contains",
			args: args{
				logsOp: "LIKE",
				key:    "service.name",
				op:     v3.FilterOperatorContains,
				value:  "application",
			},
			want: `simpleJSONExtractString(lower(labels), 'service.name') LIKE '%application%'`,
		},
		{
			name: "test eq",
			args: args{
				logsOp: "=",
				key:    "service.name",
				op:     v3.FilterOperatorEqual,
				value:  "Application",
			},
			want: `simpleJSONExtractString(lower(labels), 'service.name') = 'application'`,
		},
		{
			name: "test value with quotes",
			args: args{
				logsOp: "=",
				key:    "service.name",
				op:     v3.FilterOperatorEqual,
				value:  "Application's",
			},
			want: `simpleJSONExtractString(lower(labels), 'service.name') = 'application\'s'`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildResourceFilter(tt.args.logsOp, tt.args.key, tt.args.op, tt.args.value); got != tt.want {
				t.Errorf("buildResourceFilter() = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_buildIndexFilterForInOperator(t *testing.T) {
	type args struct {
		key   string
		op    v3.FilterOperator
		value interface{}
	}
	tests := []struct {
		name string
		args args
		want string
	}{
		{
			name: "test in array",
			args: args{
				key:   "service.name",
				op:    v3.FilterOperatorIn,
				value: []interface{}{"Application", "Test"},
			},
			want: `(lower(labels) like '%"service.name":"application"%' OR lower(labels) like '%"service.name":"test"%')`,
		},
		{
			name: "test nin array",
			args: args{
				key:   "service.name",
				op:    v3.FilterOperatorNotIn,
				value: []interface{}{"Application", "Test"},
			},
			want: `(lower(labels) not like '%"service.name":"application"%' AND lower(labels) not like '%"service.name":"test"%')`,
		},
		{
			name: "test in string",
			args: args{
				key:   "service.name",
				op:    v3.FilterOperatorIn,
				value: "application",
			},
			want: `(lower(labels) like '%"service.name":"application"%')`,
		},
		{
			name: "test nin string",
			args: args{
				key:   "service.name",
				op:    v3.FilterOperatorNotIn,
				value: "application'\"s",
			},
			want: `(lower(labels) not like '%"service.name":"application'"s"%')`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildIndexFilterForInOperator(tt.args.key, tt.args.op, tt.args.value); got != tt.want {
				t.Errorf("buildIndexFilterForInOperator() = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_buildResourceIndexFilter(t *testing.T) {
	type args struct {
		key   string
		op    v3.FilterOperator
		value interface{}
	}
	tests := []struct {
		name string
		args args
		want string
	}{
		{
			name: "test contains",
			args: args{
				key:   "service.name",
				op:    v3.FilterOperatorContains,
				value: "application",
			},
			want: `lower(labels) like '%service.name%application%'`,
		},
		{
			name: "test not contains",
			args: args{
				key:   "service.name",
				op:    v3.FilterOperatorNotContains,
				value: "application",
			},
			want: `lower(labels) not like '%service.name%application%'`,
		},
		{
			name: "test not regex",
			args: args{
				key:   "service.name",
				op:    v3.FilterOperatorNotRegex,
				value: ".*",
			},
			want: `lower(labels) not like '%service.name%'`,
		},
		{
			name: "test in",
			args: args{
				key:   "service.name",
				op:    v3.FilterOperatorNotIn,
				value: []interface{}{"Application", "Test"},
			},
			want: `(lower(labels) not like '%"service.name":"application"%' AND lower(labels) not like '%"service.name":"test"%')`,
		},
		{
			name: "test eq",
			args: args{
				key:   "service.name",
				op:    v3.FilterOperatorEqual,
				value: "Application",
			},
			want: `lower(labels) like '%service.name%application%'`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildResourceIndexFilter(tt.args.key, tt.args.op, tt.args.value); got != tt.want {
				t.Errorf("buildResourceIndexFilter() = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_buildResourceFiltersFromFilterItems(t *testing.T) {
	type args struct {
		fs *v3.FilterSet
	}
	tests := []struct {
		name    string
		args    args
		want    []string
		wantErr bool
	}{
		{
			name: "ignore attribute",
			args: args{
				fs: &v3.FilterSet{
					Items: []v3.FilterItem{
						{
							Key: v3.AttributeKey{
								Key:      "service.name",
								DataType: v3.AttributeKeyDataTypeString,
								Type:     v3.AttributeKeyTypeTag,
							},
							Operator: v3.FilterOperatorEqual,
							Value:    "test",
						},
					},
				},
			},
			want:    nil,
			wantErr: false,
		},
		{
			name: "build filter",
			args: args{
				fs: &v3.FilterSet{
					Items: []v3.FilterItem{
						{
							Key: v3.AttributeKey{
								Key:      "service.name",
								DataType: v3.AttributeKeyDataTypeString,
								Type:     v3.AttributeKeyTypeResource,
							},
							Operator: v3.FilterOperatorEqual,
							Value:    "test",
						},
					},
				},
			},
			want: []string{
				"simpleJSONExtractString(lower(labels), 'service.name') = 'test'",
				"lower(labels) like '%service.name%test%'",
			},
			wantErr: false,
		},
		{
			name: "build filter with multiple items",
			args: args{
				fs: &v3.FilterSet{
					Items: []v3.FilterItem{
						{
							Key: v3.AttributeKey{
								Key:      "service.name",
								DataType: v3.AttributeKeyDataTypeString,
								Type:     v3.AttributeKeyTypeResource,
							},
							Operator: v3.FilterOperatorEqual,
							Value:    "test",
						},
						{
							Key: v3.AttributeKey{
								Key:      "namespace",
								DataType: v3.AttributeKeyDataTypeString,
								Type:     v3.AttributeKeyTypeResource,
							},
							Operator: v3.FilterOperatorContains,
							Value:    "test1",
						},
					},
				},
			},
			want: []string{
				"simpleJSONExtractString(lower(labels), 'service.name') = 'test'",
				"lower(labels) like '%service.name%test%'",
				"simpleJSONExtractString(lower(labels), 'namespace') LIKE '%test1%'",
				"lower(labels) like '%namespace%test1%'",
			},
			wantErr: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := buildResourceFiltersFromFilterItems(tt.args.fs)
			if (err != nil) != tt.wantErr {
				t.Errorf("buildResourceFiltersFromFilterItems() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("buildResourceFiltersFromFilterItems() = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_buildResourceFiltersFromGroupBy(t *testing.T) {
	type args struct {
		groupBy []v3.AttributeKey
	}
	tests := []struct {
		name string
		args args
		want []string
	}{
		{
			name: "build filter",
			args: args{
				groupBy: []v3.AttributeKey{
					{
						Key:      "service.name",
						DataType: v3.AttributeKeyDataTypeString,
						Type:     v3.AttributeKeyTypeResource,
					},
				},
			},
			want: []string{
				"(simpleJSONHas(lower(labels), 'service.name') AND lower(labels) like '%service.name%')",
			},
		},
		{
			name: "build filter multiple group by",
			args: args{
				groupBy: []v3.AttributeKey{
					{
						Key:      "service.name",
						DataType: v3.AttributeKeyDataTypeString,
						Type:     v3.AttributeKeyTypeResource,
					},
					{
						Key:      "namespace",
						DataType: v3.AttributeKeyDataTypeString,
						Type:     v3.AttributeKeyTypeResource,
					},
				},
			},
			want: []string{
				"(simpleJSONHas(lower(labels), 'service.name') AND lower(labels) like '%service.name%')",
				"(simpleJSONHas(lower(labels), 'namespace') AND lower(labels) like '%namespace%')",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildResourceFiltersFromGroupBy(tt.args.groupBy); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("buildResourceFiltersFromGroupBy() = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_buildResourceFiltersFromAggregateAttribute(t *testing.T) {
	type args struct {
		aggregateAttribute v3.AttributeKey
	}
	tests := []struct {
		name string
		args args
		want string
	}{
		{
			name: "build filter",
			args: args{
				aggregateAttribute: v3.AttributeKey{
					Key:      "service.name",
					DataType: v3.AttributeKeyDataTypeString,
					Type:     v3.AttributeKeyTypeResource,
				},
			},
			want: "(simpleJSONHas(lower(labels), 'service.name') AND lower(labels) like '%service.name%')",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildResourceFiltersFromAggregateAttribute(tt.args.aggregateAttribute); got != tt.want {
				t.Errorf("buildResourceFiltersFromAggregateAttribute() = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_buildResourceSubQuery(t *testing.T) {
	type args struct {
		bucketStart        int64
		bucketEnd          int64
		fs                 *v3.FilterSet
		groupBy            []v3.AttributeKey
		aggregateAttribute v3.AttributeKey
	}
	tests := []struct {
		name    string
		args    args
		want    string
		wantErr bool
	}{
		{
			name: "build sub query",
			args: args{
				bucketStart: 1680064560,
				bucketEnd:   1680066458,
				fs: &v3.FilterSet{
					Items: []v3.FilterItem{
						{
							Key: v3.AttributeKey{
								Key:      "service.name",
								DataType: v3.AttributeKeyDataTypeString,
								Type:     v3.AttributeKeyTypeResource,
							},
							Operator: v3.FilterOperatorEqual,
							Value:    "test",
						},
						{
							Key: v3.AttributeKey{
								Key:      "namespace",
								DataType: v3.AttributeKeyDataTypeString,
								Type:     v3.AttributeKeyTypeResource,
							},
							Operator: v3.FilterOperatorContains,
							Value:    "test1",
						},
					},
				},
				groupBy: []v3.AttributeKey{
					{
						Key:      "host.name",
						DataType: v3.AttributeKeyDataTypeString,
						Type:     v3.AttributeKeyTypeResource,
					},
				},
				aggregateAttribute: v3.AttributeKey{
					Key:      "cluster.name",
					DataType: v3.AttributeKeyDataTypeString,
					Type:     v3.AttributeKeyTypeResource,
				},
			},
			want: "(SELECT fingerprint FROM signoz_logs.distributed_logs_v2_resource WHERE " +
				"(seen_at_ts_bucket_start >= 1680064560) AND (seen_at_ts_bucket_start <= 1680066458) AND " +
				"simpleJSONExtractString(lower(labels), 'service.name') = 'test' AND lower(labels) like '%service.name%test%' " +
				"AND simpleJSONExtractString(lower(labels), 'namespace') LIKE '%test1%' AND lower(labels) like '%namespace%test1%' " +
				"AND (simpleJSONHas(lower(labels), 'cluster.name') AND lower(labels) like '%cluster.name%') AND " +
				"( (simpleJSONHas(lower(labels), 'host.name') AND lower(labels) like '%host.name%') ))",
			wantErr: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := buildResourceSubQuery(tt.args.bucketStart, tt.args.bucketEnd, tt.args.fs, tt.args.groupBy, tt.args.aggregateAttribute)
			if (err != nil) != tt.wantErr {
				t.Errorf("buildResourceSubQuery() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("buildResourceSubQuery() = %v, want %v", got, tt.want)
			}
		})
	}
}
