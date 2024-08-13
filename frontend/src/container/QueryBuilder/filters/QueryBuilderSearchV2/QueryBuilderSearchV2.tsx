/* eslint-disable sonarjs/cognitive-complexity */
import './QueryBuilderSearchV2.styles.scss';

import { Select, Spin, Tag, Tooltip } from 'antd';
import {
	OPERATORS,
	QUERY_BUILDER_OPERATORS_BY_TYPES,
	QUERY_BUILDER_SEARCH_VALUES,
} from 'constants/queryBuilder';
import { DEBOUNCE_DELAY } from 'constants/queryBuilderFilterConfig';
import { WhereClauseConfig } from 'hooks/queryBuilder/useAutoComplete';
import { useGetAggregateKeys } from 'hooks/queryBuilder/useGetAggregateKeys';
import { useGetAggregateValues } from 'hooks/queryBuilder/useGetAggregateValues';
import { validationMapper } from 'hooks/queryBuilder/useIsValidTag';
import { operatorTypeMapper } from 'hooks/queryBuilder/useOperatorType';
import useDebounceValue from 'hooks/useDebounce';
import { isArray, isEmpty, isEqual, isObject, isUndefined } from 'lodash-es';
import type { BaseSelectRef } from 'rc-select';
import {
	KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	BaseAutocompleteData,
	DataTypes,
} from 'types/api/queryBuilder/queryAutocompleteResponse';
import {
	IBuilderQuery,
	TagFilter,
} from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';
import { popupContainer } from 'utils/selectPopupContainer';
import { v4 as uuid } from 'uuid';

import { selectStyle } from '../QueryBuilderSearch/config';
import { PLACEHOLDER } from '../QueryBuilderSearch/constant';
import { TypographyText } from '../QueryBuilderSearch/style';
import { getTagToken, isInNInOperator } from '../QueryBuilderSearch/utils';
import Suggestions from './Suggestions';

export interface ITag {
	id?: string;
	key: BaseAutocompleteData;
	op: string;
	value: string[] | string | number | boolean;
}

interface CustomTagProps {
	label: React.ReactNode;
	value: string;
	disabled: boolean;
	onClose: () => void;
	closable: boolean;
}

interface QueryBuilderSearchV2Props {
	query: IBuilderQuery;
	onChange: (value: TagFilter) => void;
	whereClauseConfig?: WhereClauseConfig;
	placeholder?: string;
	className?: string;
	suffixIcon?: React.ReactNode;
}

export interface Option {
	label: string;
	value: BaseAutocompleteData | string;
}

export enum DropdownState {
	ATTRIBUTE_KEY = 'ATTRIBUTE_KEY',
	OPERATOR = 'OPERATOR',
	ATTRIBUTE_VALUE = 'ATTRIBUTE_VALUE',
}

function getInitTags(query: IBuilderQuery): ITag[] {
	return query.filters.items.map((item) => ({
		id: item.id,
		key: item.key as BaseAutocompleteData,
		op: item.op,
		value: `${item.value}`,
	}));
}

function QueryBuilderSearchV2(
	props: QueryBuilderSearchV2Props,
): React.ReactElement {
	const {
		query,
		onChange,
		placeholder,
		className,
		suffixIcon,
		whereClauseConfig,
	} = props;

	const selectRef = useRef<BaseSelectRef>(null);

	const [isOpen, setIsOpen] = useState<boolean>(false);

	// create the tags from the initial query here, this should only be computed on the first load as post that tags and query will be always in sync.
	const [tags, setTags] = useState<ITag[]>(() => getInitTags(query));

	// this will maintain the current state of in process filter item
	const [currentFilterItem, setCurrentFilterItem] = useState<ITag | undefined>();

	const [currentState, setCurrentState] = useState<DropdownState>(
		DropdownState.ATTRIBUTE_KEY,
	);

	// to maintain the current running state until the tokenization happens for the tag
	const [searchValue, setSearchValue] = useState<string>('');

	const [dropdownOptions, setDropdownOptions] = useState<Option[]>([]);

	const memoizedSearchParams = useMemo(
		() => [
			searchValue,
			query.dataSource,
			query.aggregateOperator,
			query.aggregateAttribute.key,
		],
		[
			searchValue,
			query.dataSource,
			query.aggregateOperator,
			query.aggregateAttribute.key,
		],
	);

	const memoizedValueParams = useMemo(
		() => [
			query.aggregateOperator,
			query.dataSource,
			query.aggregateAttribute.key,
			currentFilterItem?.key?.key || '',
			currentFilterItem?.key?.dataType,
			currentFilterItem?.key?.type ?? '',
			isArray(currentFilterItem?.value)
				? currentFilterItem?.value?.[currentFilterItem.value.length - 1]
				: currentFilterItem?.value,
		],
		[
			query.aggregateOperator,
			query.dataSource,
			query.aggregateAttribute.key,
			currentFilterItem?.key?.key,
			currentFilterItem?.key?.dataType,
			currentFilterItem?.key?.type,
			currentFilterItem?.value,
		],
	);

	const searchParams = useDebounceValue(memoizedSearchParams, DEBOUNCE_DELAY);

	const valueParams = useDebounceValue(memoizedValueParams, DEBOUNCE_DELAY);

	const isQueryEnabled = useMemo(() => {
		if (currentState === DropdownState.ATTRIBUTE_KEY) {
			return query.dataSource === DataSource.METRICS
				? !!query.aggregateOperator &&
						!!query.dataSource &&
						!!query.aggregateAttribute.dataType
				: true;
		}
		return false;
	}, [
		currentState,
		query.aggregateAttribute.dataType,
		query.aggregateOperator,
		query.dataSource,
	]);

	const { data, isFetching } = useGetAggregateKeys(
		{
			searchText: searchValue,
			dataSource: query.dataSource,
			aggregateOperator: query.aggregateOperator,
			aggregateAttribute: query.aggregateAttribute.key,
			tagType: query.aggregateAttribute.type ?? null,
		},
		{
			queryKey: [searchParams],
			enabled: isQueryEnabled,
		},
	);

	const {
		data: attributeValues,
		isFetching: isFetchingAttributeValues,
	} = useGetAggregateValues(
		{
			aggregateOperator: query.aggregateOperator,
			dataSource: query.dataSource,
			aggregateAttribute: query.aggregateAttribute.key,
			attributeKey: currentFilterItem?.key?.key || '',
			filterAttributeKeyDataType:
				currentFilterItem?.key?.dataType ?? DataTypes.EMPTY,
			tagType: currentFilterItem?.key?.type ?? '',
			searchText: isArray(currentFilterItem?.value)
				? currentFilterItem?.value?.[currentFilterItem.value.length - 1] || ''
				: currentFilterItem?.value?.toString() || '',
		},
		{
			enabled: currentState === DropdownState.ATTRIBUTE_VALUE,
			queryKey: [valueParams],
		},
	);

	const handleDropdownSelect = useCallback(
		(value: string) => {
			let parsedValue: BaseAutocompleteData | string;

			try {
				parsedValue = JSON.parse(value);
			} catch {
				parsedValue = value;
			}
			if (currentState === DropdownState.ATTRIBUTE_KEY) {
				setCurrentFilterItem((prev) => ({
					...prev,
					key: parsedValue as BaseAutocompleteData,
					op: '',
					value: '',
				}));
				setCurrentState(DropdownState.OPERATOR);
				setSearchValue((parsedValue as BaseAutocompleteData)?.key);
			}

			if (currentState === DropdownState.OPERATOR) {
				if (value === OPERATORS.EXISTS || value === OPERATORS.NOT_EXISTS) {
					setTags((prev) => [
						...prev,
						{
							key: currentFilterItem?.key,
							op: value,
							value: '',
						} as ITag,
					]);
					setCurrentFilterItem(undefined);
					setSearchValue('');
					setCurrentState(DropdownState.ATTRIBUTE_KEY);
				} else {
					setCurrentFilterItem((prev) => ({
						key: prev?.key as BaseAutocompleteData,
						op: value as string,
						value: '',
					}));
					setCurrentState(DropdownState.ATTRIBUTE_VALUE);
					setSearchValue((prev) => `${prev} ${value}`);
				}
			}

			if (currentState === DropdownState.ATTRIBUTE_VALUE) {
				const operatorType =
					operatorTypeMapper[currentFilterItem?.op || ''] || 'NOT_VALID';
				const isMulti = operatorType === QUERY_BUILDER_SEARCH_VALUES.MULTIPLY;

				if (isMulti) {
					const { tagKey, tagOperator, tagValue } = getTagToken(searchValue);
					const newSearch = [...tagValue];
					newSearch[newSearch.length === 0 ? 0 : newSearch.length - 1] = value;
					const newSearchValue = newSearch.join(',');
					setSearchValue(`${tagKey} ${tagOperator} ${newSearchValue},`);
				} else {
					setTags((prev) => [
						...prev,
						{
							key: currentFilterItem?.key,
							op: currentFilterItem?.op,
							value,
						} as ITag,
					]);
					setCurrentFilterItem(undefined);
					setSearchValue('');
					setCurrentState(DropdownState.ATTRIBUTE_KEY);
				}
			}
		},
		[currentFilterItem?.key, currentFilterItem?.op, currentState, searchValue],
	);

	const handleSearch = useCallback((value: string) => {
		setSearchValue(value);
	}, []);

	const onInputKeyDownHandler = useCallback(
		(event: KeyboardEvent<Element>): void => {
			if (event.key === 'Backspace' && !searchValue) {
				event.stopPropagation();
				setTags((prev) => prev.slice(0, -1));
			}
		},
		[searchValue],
	);

	const handleOnBlur = useCallback((): void => {
		if (searchValue) {
			const operatorType =
				operatorTypeMapper[currentFilterItem?.op || ''] || 'NOT_VALID';
			if (
				currentFilterItem?.key &&
				isEmpty(currentFilterItem?.op) &&
				whereClauseConfig?.customKey === 'body' &&
				whereClauseConfig?.customOp === OPERATORS.CONTAINS
			) {
				setTags((prev) => [
					...prev,
					{
						key: {
							key: 'body',
							dataType: DataTypes.String,
							type: '',
							isColumn: true,
							isJSON: false,
							id: 'body--string----true',
						},
						op: OPERATORS.CONTAINS,
						value: currentFilterItem?.key?.key,
					},
				]);
				setCurrentFilterItem(undefined);
				setSearchValue('');
				setCurrentState(DropdownState.ATTRIBUTE_KEY);
			} else if (
				currentFilterItem?.op === OPERATORS.EXISTS ||
				currentFilterItem?.op === OPERATORS.NOT_EXISTS
			) {
				setTags((prev) => [
					...prev,
					{
						key: currentFilterItem?.key,
						op: currentFilterItem?.op,
						value: '',
					},
				]);
				setCurrentFilterItem(undefined);
				setSearchValue('');
				setCurrentState(DropdownState.ATTRIBUTE_KEY);
			} else if (
				validationMapper[operatorType]?.(
					isArray(currentFilterItem?.value)
						? currentFilterItem?.value.length || 0
						: 1,
				)
			) {
				setTags((prev) => [
					...prev,
					{
						key: currentFilterItem?.key as BaseAutocompleteData,
						op: currentFilterItem?.op as string,
						value: currentFilterItem?.value || '',
					},
				]);
				setCurrentFilterItem(undefined);
				setSearchValue('');
				setCurrentState(DropdownState.ATTRIBUTE_KEY);
			}
		}
	}, [
		currentFilterItem?.key,
		currentFilterItem?.op,
		currentFilterItem?.value,
		searchValue,
		whereClauseConfig?.customKey,
		whereClauseConfig?.customOp,
	]);

	// this useEffect takes care of tokenisation based on the search state
	useEffect(() => {
		const { tagKey, tagOperator, tagValue } = getTagToken(searchValue);

		if (tagKey && isUndefined(currentFilterItem?.key)) {
			let currentRunningAttributeKey;
			const isSuggestedKeyInAutocomplete = data?.payload?.attributeKeys?.some(
				(value) => value.key === searchValue,
			);

			if (isSuggestedKeyInAutocomplete) {
				const allAttributesMatchingTheKey =
					data?.payload?.attributeKeys?.filter(
						(value) => value.key === searchValue,
					) || [];

				if (allAttributesMatchingTheKey?.length === 1) {
					[currentRunningAttributeKey] = allAttributesMatchingTheKey;
				}
				if (allAttributesMatchingTheKey?.length > 1) {
					// the priority logic goes here
					[currentRunningAttributeKey] = allAttributesMatchingTheKey;
				}

				if (currentRunningAttributeKey) {
					setCurrentFilterItem({
						key: currentRunningAttributeKey,
						op: '',
						value: '',
					});

					setCurrentState(DropdownState.OPERATOR);
				}
			}
			if (data?.payload?.attributeKeys?.length === 0) {
				setCurrentFilterItem({
					key: {
						key: searchValue,
						// update this for has and nhas operator , check the useEffect of source keys in older component for details
						dataType: DataTypes.EMPTY,
						type: '',
						isColumn: false,
						isJSON: false,
					},
					op: '',
					value: '',
				});
				setCurrentState(DropdownState.OPERATOR);
			}
		} else if (
			currentFilterItem?.key &&
			currentFilterItem?.key?.key !== tagKey.split(' ')[0]
		) {
			setCurrentFilterItem(undefined);
			setCurrentState(DropdownState.ATTRIBUTE_KEY);
		} else if (tagOperator && isEmpty(currentFilterItem?.op)) {
			if (
				tagOperator === OPERATORS.EXISTS ||
				tagOperator === OPERATORS.NOT_EXISTS
			) {
				setTags((prev) => [
					...prev,
					{
						key: currentFilterItem?.key,
						op: tagOperator,
						value: '',
					} as ITag,
				]);
				setCurrentFilterItem(undefined);
				setSearchValue('');
				setCurrentState(DropdownState.ATTRIBUTE_KEY);
			} else {
				setCurrentFilterItem((prev) => ({
					key: prev?.key as BaseAutocompleteData,
					op: tagOperator,
					value: '',
				}));

				setCurrentState(DropdownState.ATTRIBUTE_VALUE);
			}
		} else if (
			!isEmpty(currentFilterItem?.op) &&
			tagOperator !== currentFilterItem?.op
		) {
			setCurrentFilterItem((prev) => ({
				key: prev?.key as BaseAutocompleteData,
				op: '',
				value: '',
			}));
			setCurrentState(DropdownState.OPERATOR);
		} else if (!isEmpty(tagValue)) {
			const currentValue = {
				key: currentFilterItem?.key as BaseAutocompleteData,
				operator: currentFilterItem?.op as string,
				value: tagValue,
			};
			if (!isEqual(currentValue, currentFilterItem)) {
				setCurrentFilterItem((prev) => ({
					key: prev?.key as BaseAutocompleteData,
					op: prev?.op as string,
					value: tagValue,
				}));
			}
			setCurrentState(DropdownState.ATTRIBUTE_VALUE);
		}
	}, [
		currentFilterItem,
		currentFilterItem?.key,
		currentFilterItem?.op,
		data?.payload?.attributeKeys,
		searchValue,
	]);

	// the useEffect takes care of setting the dropdown values correctly on change of the current state
	useEffect(() => {
		if (currentState === DropdownState.ATTRIBUTE_KEY) {
			setDropdownOptions(
				data?.payload?.attributeKeys?.map((key) => ({
					label: key.key,
					value: key,
				})) || [],
			);
		}
		if (currentState === DropdownState.OPERATOR) {
			const keyOperator = searchValue.split(' ');
			const partialOperator = keyOperator?.[1];
			const strippedKey = keyOperator?.[0];

			let operatorOptions;
			if (currentFilterItem?.key?.dataType) {
				operatorOptions = QUERY_BUILDER_OPERATORS_BY_TYPES[
					currentFilterItem.key
						.dataType as keyof typeof QUERY_BUILDER_OPERATORS_BY_TYPES
				].map((operator) => ({
					label: operator,
					value: operator,
				}));

				if (partialOperator) {
					operatorOptions = operatorOptions.filter((op) =>
						op.label.startsWith(partialOperator.toLocaleUpperCase()),
					);
				}
				setDropdownOptions(operatorOptions);
			} else if (strippedKey.endsWith('[*]') && strippedKey.startsWith('body.')) {
				operatorOptions = [OPERATORS.HAS, OPERATORS.NHAS].map((operator) => ({
					label: operator,
					value: operator,
				}));
				setDropdownOptions(operatorOptions);
			} else {
				operatorOptions = QUERY_BUILDER_OPERATORS_BY_TYPES.universal.map(
					(operator) => ({
						label: operator,
						value: operator,
					}),
				);

				if (partialOperator) {
					operatorOptions = operatorOptions.filter((op) =>
						op.label.startsWith(partialOperator.toLocaleUpperCase()),
					);
				}
				setDropdownOptions(operatorOptions);
			}
		}

		if (currentState === DropdownState.ATTRIBUTE_VALUE) {
			const values: string[] =
				Object.values(attributeValues?.payload || {}).find((el) => !!el) || [];

			const { tagValue } = getTagToken(searchValue);

			if (values.length === 0) {
				if (isArray(tagValue)) {
					if (!isEmpty(tagValue[tagValue.length - 1]))
						values.push(tagValue[tagValue.length - 1]);
				} else if (!isEmpty(tagValue)) values.push(tagValue);
			}

			setDropdownOptions(
				values.map((val) => ({
					label: val,
					value: val,
				})),
			);
		}
	}, [
		attributeValues?.payload,
		currentFilterItem?.key?.dataType,
		currentState,
		data?.payload?.attributeKeys,
		searchValue,
	]);

	useEffect(() => {
		const filterTags: IBuilderQuery['filters'] = {
			op: 'AND',
			items: [],
		};
		tags.forEach((tag) => {
			filterTags.items.push({
				id: tag.id || uuid().slice(0, 8),
				key: tag.key,
				op: tag.op,
				value: tag.value,
			});
		});

		if (!isEqual(query.filters, filterTags.items)) {
			onChange(filterTags);
			setTags(filterTags.items as ITag[]);
		}
	}, [onChange, query.filters, tags]);

	const loading = useMemo(() => isFetching || isFetchingAttributeValues, [
		isFetching,
		isFetchingAttributeValues,
	]);

	const isMetricsDataSource = useMemo(
		() => query.dataSource === DataSource.METRICS,
		[query.dataSource],
	);

	const queryTags = useMemo(
		() => tags.map((tag) => `${tag.key.key} ${tag.op} ${tag.value}`),
		[tags],
	);

	const onTagRender = ({
		value,
		closable,
		onClose,
	}: CustomTagProps): React.ReactElement => {
		const { tagOperator } = getTagToken(value);
		const isInNin = isInNInOperator(tagOperator);
		const chipValue = isInNin
			? value?.trim()?.replace(/,\s*$/, '')
			: value?.trim();

		const indexInQueryTags = queryTags.findIndex((qTag) => isEqual(qTag, value));
		const tagDetails = tags[indexInQueryTags];

		const onCloseHandler = (): void => {
			onClose();
			setSearchValue('');
			setTags((prev) => prev.filter((t) => !isEqual(t, tagDetails)));
		};

		const tagEditHandler = (value: string): void => {
			setCurrentFilterItem(tagDetails);
			setSearchValue(value);
			setTags((prev) => prev.filter((t) => !isEqual(t, tagDetails)));
		};

		const isDisabled = !!searchValue;

		return (
			<Tag
				closable={!searchValue && closable}
				onClose={onCloseHandler}
				className={tagDetails?.key?.type || ''}
			>
				<Tooltip title={chipValue}>
					<TypographyText
						ellipsis
						$isInNin={isInNin}
						disabled={isDisabled}
						$isEnabled={!!searchValue}
						onClick={(): void => {
							if (!isDisabled) tagEditHandler(value);
						}}
					>
						{chipValue}
					</TypographyText>
				</Tooltip>
			</Tag>
		);
	};

	return (
		<div className="query-builder-search-v2">
			<Select
				ref={selectRef}
				getPopupContainer={popupContainer}
				virtual
				showSearch
				tagRender={onTagRender}
				transitionName=""
				choiceTransitionName=""
				filterOption={false}
				open={isOpen}
				onDropdownVisibleChange={setIsOpen}
				autoClearSearchValue={false}
				mode="multiple"
				placeholder={placeholder}
				value={queryTags}
				searchValue={searchValue}
				className={className}
				rootClassName="query-builder-search"
				disabled={isMetricsDataSource && !query.aggregateAttribute.key}
				style={selectStyle}
				onSearch={handleSearch}
				onSelect={handleDropdownSelect}
				onInputKeyDown={onInputKeyDownHandler}
				notFoundContent={loading ? <Spin size="small" /> : null}
				suffixIcon={suffixIcon}
				showAction={['focus']}
				onBlur={handleOnBlur}
			>
				{dropdownOptions.map((option) => (
					<Select.Option
						key={isObject(option.value) ? JSON.stringify(option.value) : option.value}
						value={
							isObject(option.value) ? JSON.stringify(option.value) : option.value
						}
					>
						<Suggestions label={option.label} value={option.value} />
					</Select.Option>
				))}
			</Select>
		</div>
	);
}

QueryBuilderSearchV2.defaultProps = {
	placeholder: PLACEHOLDER,
	className: '',
	suffixIcon: null,
	whereClauseConfig: {},
};

export default QueryBuilderSearchV2;
