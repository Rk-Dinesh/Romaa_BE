import { PageConst } from "./App.const";

export const pagination = () => {
  return {
    page: obj.page ?? PageConst.DEFAULT_PAGE,
    limit: obj.limit ?? PageConst.DEFAULT_LIMIT,
    sortBy: obj.sortBy ?? PageConst.DEFAULT_SORT,
    order: obj.order ?? PageConst.DEFAULT_ORDER,
    searchBy: obj.searchBy ?? '',
    search: obj.search ?? '',
    skip: ((obj.page ?? PageConst.DEFAULT_PAGE) - 1) * (obj.limit ?? PageConst.DEFAULT_LIMIT),
  };
};