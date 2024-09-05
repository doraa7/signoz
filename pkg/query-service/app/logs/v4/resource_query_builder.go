package v4

import (
	"fmt"
	"strings"

	v3 "go.signoz.io/signoz/pkg/query-service/model/v3"
	"go.signoz.io/signoz/pkg/query-service/utils"
)

func buildResourceFilter(logsOp string, key string, op v3.FilterOperator, value interface{}) string {
	// we are using lower(labels) as we want case insensitive filtering
	searchKey := fmt.Sprintf("simpleJSONExtractString(lower(labels), '%s')", key)

	chFmtVal := utils.ClickHouseFormattedValue(value)

	switch op {
	case v3.FilterOperatorExists:
		return fmt.Sprintf("simpleJSONHas(lower(labels), '%s')", key)
	case v3.FilterOperatorNotExists:
		return fmt.Sprintf("not simpleJSONHas(lower(labels), '%s')", key)
	case v3.FilterOperatorRegex, v3.FilterOperatorNotRegex:
		return fmt.Sprintf(logsOp, searchKey, chFmtVal)
	case v3.FilterOperatorContains, v3.FilterOperatorNotContains:
		// this is required as clickhouseFormattedValue add's quotes to the string
		lowerEscapedStringValue := utils.QuoteEscapedString(strings.ToLower(fmt.Sprintf("%s", value)))
		return fmt.Sprintf("%s %s '%%%s%%'", searchKey, logsOp, lowerEscapedStringValue)
	default:
		chFmtValLower := strings.ToLower(chFmtVal)
		return fmt.Sprintf("%s %s %s", searchKey, logsOp, chFmtValLower)
	}
}

// for in operator value needs to used for indexing in a different way.
// eg1:= x in a,b,c = (labels like '%x%a%' or labels like '%"x":"b"%' or labels like '%"x"="c"%')
// eg1:= x nin a,b,c = (labels nlike '%x%a%' AND labels nlike '%"x"="b"' AND labels nlike '%"x"="c"%')
func buildIndexFilterForInOperator(key string, op v3.FilterOperator, value interface{}) string {
	conditions := []string{}
	separator := " OR "
	sqlOp := "like"
	if op == v3.FilterOperatorNotIn {
		separator = " AND "
		sqlOp = "not like"
	}

	values := []string{}

	switch value.(type) {
	case string:
		values = append(values, value.(string))
	case []interface{}:
		for _, v := range (value).([]interface{}) {
			// also resources attributes are always string values
			strV, ok := v.(string)
			if !ok {
				continue
			}
			values = append(values, strV)
		}
	}

	if len(values) > 0 {
		for _, v := range values {
			conditions = append(conditions, fmt.Sprintf("lower(labels) %s '%%\"%s\":\"%s\"%%'", sqlOp, key, strings.ToLower(v)))
		}
		return "(" + strings.Join(conditions, separator) + ")"
	}
	return ""
}

func buildResourceIndexFilter(key string, op v3.FilterOperator, value interface{}) string {
	// not using clickhouseFormattedValue as we don't wan't the quotes
	formattedValueEscapedLower := utils.QuoteEscapedString(strings.ToLower(fmt.Sprintf("%s", value)))

	// add index filters
	switch op {
	case v3.FilterOperatorContains, v3.FilterOperatorEqual, v3.FilterOperatorLike:
		return fmt.Sprintf("lower(labels) like '%%%s%%%s%%'", key, formattedValueEscapedLower)
	case v3.FilterOperatorNotContains, v3.FilterOperatorNotEqual, v3.FilterOperatorNotLike:
		return fmt.Sprintf("lower(labels) not like '%%%s%%%s%%'", key, formattedValueEscapedLower)
	case v3.FilterOperatorNotRegex:
		return fmt.Sprintf("lower(labels) not like '%%%s%%'", key)
	case v3.FilterOperatorIn, v3.FilterOperatorNotIn:
		return buildIndexFilterForInOperator(key, op, value)
	default:
		return fmt.Sprintf("lower(labels) like '%%%s%%'", key)
	}
}

func buildResourceFiltersFromFilterItems(fs *v3.FilterSet) ([]string, error) {
	var conditions []string
	if fs == nil || len(fs.Items) == 0 {
		return nil, nil
	}
	for _, item := range fs.Items {
		// skip anything other than resource attribute
		if item.Key.Type != v3.AttributeKeyTypeResource {
			continue
		}

		// since out map is in lower case we are converting it to lowercase
		operatorLower := strings.ToLower(string(item.Operator))
		op := v3.FilterOperator(operatorLower)
		keyName := strings.ToLower(item.Key.Key)

		// resource filter value data type will always be string
		// will be an interface if the operator is IN or NOT IN
		if item.Key.DataType != v3.AttributeKeyDataTypeString &&
			(op != v3.FilterOperatorIn && op != v3.FilterOperatorNotIn) {
			return nil, fmt.Errorf("invalid data type for resource attribute: %s", item.Key.Key)
		}

		var value interface{}
		var err error
		if op != v3.FilterOperatorExists && op != v3.FilterOperatorNotExists {
			// make sure to cast the value regardless of the actual type
			value, err = utils.ValidateAndCastValue(item.Value, item.Key.DataType)
			if err != nil {
				return nil, fmt.Errorf("failed to validate and cast value for %s: %v", item.Key.Key, err)
			}
		}

		if logsOp, ok := logOperators[op]; ok {
			// the filter
			if resourceFilter := buildResourceFilter(logsOp, keyName, op, value); resourceFilter != "" {
				conditions = append(conditions, resourceFilter)
			}
			// the additional filter for better usage of the index
			if resourceIndexFilter := buildResourceIndexFilter(keyName, op, value); resourceIndexFilter != "" {
				conditions = append(conditions, resourceIndexFilter)
			}
		} else {
			return nil, fmt.Errorf("unsupported operator: %s", op)
		}

	}

	return conditions, nil
}

func buildResourceFiltersFromGroupBy(groupBy []v3.AttributeKey) []string {
	var conditions []string

	for _, attr := range groupBy {
		if attr.Type != v3.AttributeKeyTypeResource {
			continue
		}
		key := strings.ToLower(attr.Key)
		conditions = append(conditions, fmt.Sprintf("(simpleJSONHas(lower(labels), '%s') AND lower(labels) like '%%%s%%')", key, key))
	}

	return conditions
}

func buildResourceFiltersFromAggregateAttribute(aggregateAttribute v3.AttributeKey) string {
	if aggregateAttribute.Key != "" && aggregateAttribute.Type == v3.AttributeKeyTypeResource {
		key := strings.ToLower(aggregateAttribute.Key)
		return fmt.Sprintf("(simpleJSONHas(lower(labels), '%s') AND lower(labels) like '%%%s%%')", key, key)
	}

	return ""
}

func buildResourceSubQuery(bucketStart, bucketEnd int64, fs *v3.FilterSet, groupBy []v3.AttributeKey, aggregateAttribute v3.AttributeKey) (string, error) {

	// BUILD THE WHERE CLAUSE
	var conditions []string
	// only add the resource attributes to the filters here
	rs, err := buildResourceFiltersFromFilterItems(fs)
	if err != nil {
		return "", err
	}
	conditions = append(conditions, rs...)

	// for aggregate attribute add exists check in resources
	aggregateAttributeResourceFilter := buildResourceFiltersFromAggregateAttribute(aggregateAttribute)
	if aggregateAttributeResourceFilter != "" {
		conditions = append(conditions, aggregateAttributeResourceFilter)
	}

	groupByResourceFilters := buildResourceFiltersFromGroupBy(groupBy)
	if len(groupByResourceFilters) > 0 {
		// TODO: change AND to OR once we know how to solve for group by ( i.e show values if one is not present)
		groupByStr := "( " + strings.Join(groupByResourceFilters, " AND ") + " )"
		conditions = append(conditions, groupByStr)
	}
	if len(conditions) == 0 {
		return "", nil
	}
	conditionStr := strings.Join(conditions, " AND ")

	// BUILD THE FINAL QUERY
	query := fmt.Sprintf("(SELECT fingerprint FROM signoz_logs.%s WHERE (seen_at_ts_bucket_start >= %d) AND (seen_at_ts_bucket_start <= %d) AND ", DISTRIBUTED_LOGS_V2_RESOURCE, bucketStart, bucketEnd)

	query = query + conditionStr + ")"

	return query, nil
}
